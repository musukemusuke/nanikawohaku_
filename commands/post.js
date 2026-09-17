const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { nanoid } = require('nanoid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post')
        .setDescription('新しい投稿を作成します。')
        .addStringOption(option =>
            option.setName('visibility')
                .setDescription('投稿の公開設定を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '🌐 公開投稿', value: 'public' },
                    { name: '🔒 非公開投稿', value: 'private' }
                )),
    async execute(interaction) {
        const visibility = interaction.options.getString('visibility');
        const isPrivate = visibility === 'private';
        
        // 公開/非公開に応じたモーダルをすぐに表示
        const modal = new ModalBuilder()
            .setCustomId(`post_modal_${isPrivate ? 'private' : 'public'}_${interaction.id}`)
            .setTitle(isPrivate ? '非公開投稿を作成' : '公開投稿を作成');

        const postContentInput = new TextInputBuilder()
            .setCustomId('postContent')
            .setLabel('投稿内容（最大280文字）')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(280);

        const postUrlInput = new TextInputBuilder()
            .setCustomId('postUrl')
            .setLabel('画像または動画のURL (任意)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(postContentInput);
        const secondActionRow = new ActionRowBuilder().addComponents(postUrlInput);
        
        // 非公開の場合は追加で閲覧許可ユーザーの入力欄を追加
        if (isPrivate) {
            const allowedUsersInput = new TextInputBuilder()
                .setCustomId('allowedUsers')
                .setLabel('閲覧を許可するユーザー名 (カンマ区切り)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('例: ユーザー名1, ユーザー名2');
            const thirdActionRow = new ActionRowBuilder().addComponents(allowedUsersInput);
            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
        } else {
            modal.addComponents(firstActionRow, secondActionRow);
        }

        // 元のインタラクションをマップに保存（モーダル送信後に使用）
        interaction.client.postInteractions.set(interaction.id, interaction);
        
        // モーダルを表示
        await interaction.showModal(modal);
    },
    async handleButton(interaction) {
        // customIdから元のinteractionIdを抽出
        const parts = interaction.customId.split('_');
        const action = parts[0]; // 'confirm'
        const subAction = parts[1]; // 'post'
        const type = parts[2]; // 'yes' or 'no'
        const originalInteractionId = parts[3]; // 元のinteraction.id

        // 元のインタラクションを取得
        const originalInteraction = interaction.client.postInteractions.get(originalInteractionId);

        if (!originalInteraction) {
            await interaction.update({ content: 'この投稿プロセスは無効になりました。', components: [] });
            return;
        }

        if (action === 'confirm' && subAction === 'post' && type === 'yes') {
            // 投稿データをデータベースに保存
            const db = interaction.client.db;
            const postId = nanoid(10); // 10文字の投稿IDを生成

            // モーダルから取得した情報を再構築
            const embedDescription = interaction.message.embeds[0].description;
            const postContentMatch = embedDescription.match(/投稿内容:\n([\s\S]+?)(?=\nURL:|\n閲覧許可ユーザー名:|$)/);
            const postUrlMatch = embedDescription.match(/URL: (.+)/);
            const allowedUsersMatch = embedDescription.match(/閲覧許可ユーザー名: (.+)/);

            const postContent = postContentMatch ? postContentMatch[1].trim() : '内容不明';
            const postUrl = postUrlMatch ? postUrlMatch[1].trim() : null;
            const allowedUsers = allowedUsersMatch ? allowedUsersMatch[1].trim() : null;
            const isPrivate = allowedUsers !== null; // allowedUsersがあれば非公開と判断

            const authorId = originalInteraction.user.id; // originalInteractionから取得
            const authorUsername = originalInteraction.user.username; // originalInteractionから取得
            const guildId = originalInteraction.guild.id; // originalInteractionから取得
            const guildName = originalInteraction.guild.name; // サーバー名を取得
            const channelId = originalInteraction.channel.id; // originalInteractionから取得
            const createdAt = new Date().toISOString();

            db.run(`INSERT INTO posts (id, author_id, author_username, guild_id, guild_name, channel_id, content, image_url, is_private, allowed_users, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [postId, authorId, authorUsername, guildId, guildName, channelId, postContent, postUrl, isPrivate ? 1 : 0, allowedUsers, createdAt],
                function(err) {
                    if (err) {
                        console.error('Error inserting post into database:', err.message);
                        interaction.update({ content: '投稿の保存中にエラーが発生しました。', components: [] });
                        return;
                    }
                    console.log(`Post ${postId} saved to database.`);
                    interaction.update({ content: `投稿が完了しました！投稿ID: \`${postId}\`\n(この投稿は /feed コマンドで表示されます)`, components: [] });
                    // 投稿プロセス完了後、マップから削除
                    interaction.client.postInteractions.delete(originalInteraction.id);
                }
            );
        } else if (action === 'confirm' && subAction === 'post' && type === 'no') {
            await interaction.update({ content: '投稿をキャンセルしました。', components: [] });
            // 投稿プロセスキャンセル後、マップから削除
            interaction.client.postInteractions.delete(originalInteraction.id);
        }
    },
    async handleModalSubmit(interaction) {
        // customIdから元のinteractionIdを抽出
        const parts = interaction.customId.split('_');
        const originalInteractionId = parts[parts.length - 1]; // 最後の要素がoriginalInteractionId

        // 元のインタラクションを取得
        const originalInteraction = interaction.client.postInteractions.get(originalInteractionId);

        if (!originalInteraction) {
            await interaction.reply({ content: 'この投稿プロセスは無効になりました。', ephemeral: true });
            return;
        }

        if (interaction.customId.startsWith('post_modal_public') || interaction.customId.startsWith('post_modal_private')) {
            const postContent = interaction.fields.getTextInputValue('postContent');
            const postUrl = interaction.fields.getTextInputValue('postUrl');
            const allowedUsers = interaction.customId.startsWith('post_modal_private') ? interaction.fields.getTextInputValue('allowedUsers') : null;

            const confirmPostButton = new ButtonBuilder()
                .setCustomId(`confirm_post_yes_${originalInteractionId}`) // originalInteractionIdを含める
                .setLabel('はい')
                .setStyle(ButtonStyle.Success);

            const cancelPostButton = new ButtonBuilder()
                .setCustomId(`confirm_post_no_${originalInteractionId}`) // originalInteractionIdを含める
                .setLabel('いいえ')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(confirmPostButton, cancelPostButton);

            let confirmationDescription = `以下の内容で投稿しますか？\n\n**投稿内容:**\n${postContent}`;
            if (postUrl) {
                confirmationDescription += `\n**URL:** ${postUrl}`;
            }
            if (allowedUsers) {
                confirmationDescription += `\n**閲覧許可ユーザー名:** ${allowedUsers}`;
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('投稿内容の確認')
                .setDescription(confirmationDescription)
                .setColor(0xFFA500); // 確認用にオレンジ色を設定

            await interaction.reply({
                embeds: [confirmEmbed], // Embedを送信
                components: [row],
                ephemeral: true, // 確認メッセージはエフェメラル
            });
        }
    },
    async handleReaction(reaction, user, originalInteraction) {
        // originalInteraction は index.js から渡されるため、ここでフェッチは不要
        // user.id !== originalInteraction.user.id のチェックも index.js で行われる

        // ユーザーのリアクションを削除して、複数回トリガーされるのを防ぐ
        // index.js で処理されるため、ここでは不要

        if (reaction.emoji.name === '🌐') { // 公開投稿
            const modal = new ModalBuilder()
                .setCustomId(`post_modal_public_${originalInteraction.id}`) // originalInteractionIdを含める
                .setTitle('公開投稿を作成');

            const postContentInput = new TextInputBuilder()
                .setCustomId('postContent')
                .setLabel('投稿内容（最大280文字）')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(280);

            const postUrlInput = new TextInputBuilder()
                .setCustomId('postUrl')
                .setLabel('画像または動画のURL (任意)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const firstActionRow = new ActionRowBuilder().addComponents(postContentInput);
            const secondActionRow = new ActionRowBuilder().addComponents(postUrlInput);

            modal.addComponents(firstActionRow, secondActionRow);
            console.log('Trying to show public modal. originalInteraction valid?', !!originalInteraction, 'replied?', originalInteraction.replied, 'deferred?', originalInteraction.deferred);
            try {
                await originalInteraction.showModal(modal); // originalInteraction を使用
                console.log('Public modal shown successfully');
                // モーダルが正常に表示されたらリアクションメッセージを削除
                await reaction.message.delete();
                console.log('Reaction message deleted');
            } catch (err) {
                console.error('Error showing public modal in post.js:', err); // 常にログを出力してエラー内容を確認
            }
        } else if (reaction.emoji.name === '🔒') { // 非公開投稿
            const modal = new ModalBuilder()
                .setCustomId(`post_modal_private_${originalInteraction.id}`) // originalInteractionIdを含める
                .setTitle('非公開投稿を作成');

            const postContentInput = new TextInputBuilder()
                .setCustomId('postContent')
                .setLabel('投稿内容（最大280文字）')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(280);

            const postUrlInput = new TextInputBuilder()
                .setCustomId('postUrl')
                .setLabel('画像または動画のURL (任意)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const allowedUsersInput = new TextInputBuilder()
                .setCustomId('allowedUsers')
                .setLabel('閲覧を許可するユーザー名 (カンマ区切り)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('例: ユーザー名1, ユーザー名2');

            const firstActionRow = new ActionRowBuilder().addComponents(postContentInput);
            const secondActionRow = new ActionRowBuilder().addComponents(postUrlInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(allowedUsersInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
            console.log('Trying to show private modal. originalInteraction valid?', !!originalInteraction, 'replied?', originalInteraction.replied, 'deferred?', originalInteraction.deferred);
            try {
                await originalInteraction.showModal(modal); // originalInteraction を使用
                console.log('Private modal shown successfully');
                // モーダルが正常に表示されたらリアクションメッセージを削除
                await reaction.message.delete();
                console.log('Reaction message deleted');
            } catch (err) {
                console.error('Error showing private modal in post.js:', err); // 常にログを出力してエラー内容を確認
            }
        } else if (reaction.emoji.name === '❌') { // キャンセル
            try {
                await originalInteraction.editReply({ content: '投稿作成をキャンセルしました。', components: [] }); // originalInteraction を使用
            } catch (editErr) {
                if (editErr.code !== 10008) {
                    console.error('Error editing reply in post.js:', editErr);
                }
            }
            // キャンセル後、マップから削除
            originalInteraction.client.postInteractions.delete(originalInteraction.id);
        }
    }
};