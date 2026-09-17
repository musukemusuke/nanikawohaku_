const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewreplies')
        .setDescription('指定した投稿の全てのリプライを表示します。')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('リプライを表示したい投稿のID')
                .setRequired(true)),
    async execute(interaction) {
        const postId = interaction.options.getString('postid');
        const db = interaction.client.db;

        // まず元の投稿が存在するか確認
        db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
            if (err) {
                console.error('Error fetching post:', err.message);
                await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', ephemeral: true });
                return;
            }

            if (!post) {
                await interaction.reply({ content: '指定されたIDの投稿が存在しません。', ephemeral: true });
                return;
            }

            // 次にその投稿についた全てのリプライを取得
            db.all(`SELECT * FROM replies WHERE post_id = ? ORDER BY created_at DESC LIMIT 50`, [postId], async (err, replies) => {
                if (err) {
                    console.error('Error fetching replies:', err.message);
                    await interaction.reply({ content: 'リプライの取得中にエラーが発生しました。', ephemeral: true });
                    return;
                }

                if (replies.length === 0) {
                    await interaction.reply({ content: 'この投稿にはまだリプライがありません。', ephemeral: true });
                    return;
                }

                // ページング処理
                const limit = 5;
                let currentPage = 0;
                const totalPages = Math.ceil(replies.length / limit);

                const displayPage = async (page) => {
                    const start = page * limit;
                    const end = start + limit;
                    const pageReplies = replies.slice(start, end);

                    const embeds = [];
                    const allComponents = [];

                    // 元の投稿のEmbedを最初に追加
                    const postEmbed = new EmbedBuilder()
                        .setTitle(`元の投稿 by ${post.author_username}`)
                        .setDescription(post.content)
                        .addFields({ name: 'サーバー', value: post.guild_name || '不明' })
                        .setColor(0x00FF00)
                        .setTimestamp(new Date(post.created_at))
                        .setFooter({ text: `ID: ${post.id} | いいね: ${post.likes}` });
                    if (post.image_url) {
                        postEmbed.setImage(post.image_url);
                    }
                    embeds.push(postEmbed);

                    // リプライのEmbedを追加
                    for (let i = 0; i < pageReplies.length; i++) {
                        const reply = pageReplies[i];
                        const replyEmbed = new EmbedBuilder()
                            .setTitle(`💬 リプライ by ${reply.author_username}`)
                            .setDescription(reply.content)
                            .setColor(0x0099FF)
                            .setTimestamp(new Date(reply.created_at))
                            .setFooter({ text: `リプライID: ${reply.id}` });
                        embeds.push(replyEmbed);
                    }

                    // ページングボタン
                    if (totalPages > 1) {
                        const pageMessageId = interaction.id;
                        const prevButton = new ButtonBuilder()
                            .setCustomId(`prev_page_${pageMessageId}`)
                            .setLabel('前へ')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('⬅️')
                            .setDisabled(page === 0);

                        const nextButton = new ButtonBuilder()
                            .setCustomId(`next_page_${pageMessageId}`)
                            .setLabel('次へ')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➡️')
                            .setDisabled(page >= totalPages - 1);

                        const pageRow = new ActionRowBuilder().addComponents(prevButton, nextButton);
                        allComponents.push(pageRow);

                        interaction.client.pageInteractions.set(pageMessageId, {
                            originalInteraction: interaction,
                            allRows: replies,
                            post: post,
                            currentPage: page,
                            totalPages: totalPages,
                            userId: interaction.user.id,
                            title: `投稿「${post.id}」のリプライ一覧`,
                            messageId: pageMessageId
                        });
                    }

                    await interaction.editReply({
                        content: `投稿「${post.id}」のリプライ一覧 - ${page + 1}/${totalPages}ページ（全${replies.length}件）`,
                        embeds: embeds,
                        components: allComponents
                    });
                };

                await interaction.reply({ content: 'リプライ一覧を読み込み中...', withResponse: true });
                await displayPage(currentPage);
            });
        });
    },
    async handlePageButton(interaction) {
        const [action, _, pageMessageId] = interaction.customId.split('_');
        const pageData = interaction.client.pageInteractions.get(pageMessageId);
        
        if (!pageData || interaction.user.id !== pageData.userId) {
            await interaction.reply({ content: 'この操作はできません。', ephemeral: true });
            return;
        }

        const allReplies = pageData.allRows;
        let currentPage = pageData.currentPage;
        const totalPages = pageData.totalPages;
        const title = pageData.title;
        const post = pageData.post;
        const limit = 5;

        if (action === 'next' && currentPage < totalPages - 1) {
            currentPage++;
        } else if (action === 'prev' && currentPage > 0) {
            currentPage--;
        } else {
            await interaction.reply({ content: 'これ以上ページを移動できません。', ephemeral: true });
            return;
        }

        const start = currentPage * limit;
        const end = start + limit;
        const pageReplies = allReplies.slice(start, end);

        const embeds = [];
        const allComponents = [];

        // 元の投稿のEmbedを最初に追加
        const postDescription = post.image_url ? `${post.content}\n${post.image_url}` : post.content;
        const postEmbed = new EmbedBuilder()
            .setTitle(`元の投稿 by ${post.author_username}`)
            .setDescription(postDescription)
            .addFields({ name: 'サーバー', value: post.guild_name || '不明' })
            .setColor(0x00FF00)
            .setTimestamp(new Date(post.created_at))
            .setFooter({ text: `ID: ${post.id} | いいね: ${post.likes}` });
        embeds.push(postEmbed);

        // リプライのEmbedを追加
        for (let i = 0; i < pageReplies.length; i++) {
            const reply = pageReplies[i];
            const replyEmbed = new EmbedBuilder()
                .setTitle(`💬 リプライ by ${reply.author_username}`)
                .setDescription(reply.content)
                .setColor(0x0099FF)
                .setTimestamp(new Date(reply.created_at))
                .setFooter({ text: `リプライID: ${reply.id}` });
            embeds.push(replyEmbed);
        }

        if (totalPages > 1) {
            const newPrevButton = new ButtonBuilder()
                .setCustomId(`prev_page_${pageMessageId}`)
                .setLabel('前へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
                .setDisabled(currentPage === 0);

            const newNextButton = new ButtonBuilder()
                .setCustomId(`next_page_${pageMessageId}`)
                .setLabel('次へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➡️')
                .setDisabled(currentPage >= totalPages - 1);

            const pageRow = new ActionRowBuilder().addComponents(newPrevButton, newNextButton);
            allComponents.push(pageRow);
        }

        await pageData.originalInteraction.editReply({
            content: `${title} - ${currentPage + 1}/${totalPages}ページ（全${allReplies.length}件）`,
            embeds: embeds,
            components: allComponents
        });

        await interaction.update({});

        const updatedPageData = interaction.client.pageInteractions.get(pageMessageId);
        if (updatedPageData) {
            updatedPageData.currentPage = currentPage;
            interaction.client.pageInteractions.set(pageMessageId, updatedPageData);
        }
    }
};