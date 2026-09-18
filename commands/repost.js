const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generateId, sendNotification } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('repost')
        .setDescription('投稿を引用してリポストします')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('リポストする元の投稿ID')
                .setRequired(true)),
    async execute(interaction) {
        const postId = interaction.options.getString('postid');
        const db = interaction.client.db;

        // 元の投稿を取得
        const originalPost = await new Promise((resolve) => {
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], (err, row) => {
                resolve(row);
            });
        });

        if (!originalPost) {
            return interaction.reply({ content: '指定された投稿IDが見つかりません。', flags: 64 });
        }

        // 既にリポストしていないか確認
        const alreadyReposted = await new Promise((resolve) => {
            db.get(`SELECT 1 FROM reposts WHERE original_post_id = ? AND user_id = ?`, [postId, interaction.user.id], (err, row) => {
                resolve(!!row);
            });
        });

        if (alreadyReposted) {
            return interaction.reply({ content: 'この投稿は既にリポストしています。', flags: 64 });
        }

        // 引用文を入力するモーダルを表示
        const modal = new ModalBuilder()
            .setCustomId(`repost_modal_${postId}_${interaction.id}`)
            .setTitle('投稿をリポスト');

        const quoteInput = new TextInputBuilder()
            .setCustomId('quoteText')
            .setLabel('引用文（任意、最大140文字）')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(140);

        const firstActionRow = new ActionRowBuilder().addComponents(quoteInput);
        modal.addComponents(firstActionRow);

        // 元のインタラクションを保存
        interaction.client.postInteractions.set(interaction.id, interaction);
        await interaction.showModal(modal);
    },
    async handleModalSubmit(interaction) {
        if (!interaction.customId.startsWith('repost_modal_')) return;

        const parts = interaction.customId.split('_');
        const originalPostId = parts[2];
        const originalInteractionId = parts[3];
        const originalInteraction = interaction.client.postInteractions.get(originalInteractionId);

        if (!originalInteraction) {
            return interaction.reply({ content: 'このリポストプロセスは無効になりました。', flags: 64 });
        }

        const quoteText = interaction.fields.getTextInputValue('quoteText') || null;
        const db = interaction.client.db;
        const repostId = generateId();

        // リポストをデータベースに保存
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO reposts (id, original_post_id, user_id, quote_text) VALUES (?, ?, ?, ?)`, 
                [repostId, originalPostId, interaction.user.id, quoteText], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
        });

        // 元の投稿の作者にリポスト通知を送信
        const originalPost = await new Promise((resolve) => {
            db.get(`SELECT author_id FROM posts WHERE id = ?`, [originalPostId], (err, row) => {
                resolve(row);
            });
        });

        if (originalPost) {
            await sendNotification(db, originalPost.author_id, interaction.user.id, originalPostId, 'repost');
        }

        // リポスト完了メッセージ
        const repostEmbed = new EmbedBuilder()
            .setColor(0x1DA1F2)
            .setTitle('🔄 リポストしました！')
            .setDescription(quoteText ? `あなたのコメント: ${quoteText}\n\n元の投稿: ${originalPostId}` : `元の投稿ID: ${originalPostId} をリポストしました。`)
            .setTimestamp();

        await interaction.reply({ embeds: [repostEmbed], flags: 64 });
        interaction.client.postInteractions.delete(originalInteractionId);
    }
};