const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('globalfeed')
        .setDescription('全サーバーの公開投稿を表示します。'),
    async execute(interaction) {
        const db = interaction.client.db;
        // 全サーバーの公開投稿を取得（guild_idの条件を除外）
        db.all(`SELECT * FROM posts WHERE is_private = 0 ORDER BY created_at DESC LIMIT 50`, async (err, rows) => {
            if (err) {
                console.error('Error fetching global posts:', err.message);
                await interaction.reply({ content: 'グローバルフィードの取得中にエラーが発生しました。', flags: 64 });
                return;
            }

            if (rows.length === 0) {
                await interaction.reply({ content: 'まだ公開投稿がありません。', flags: 64 });
                return;
            }

            // ページング処理
            const limit = 5;
            let currentPage = 0;
            const totalPages = Math.ceil(rows.length / limit);

            const displayPage = async (page) => {
                const start = page * limit;
                const end = start + limit;
                const pageRows = rows.slice(start, end);

                const embeds = [];
                const allComponents = [];

                for (let i = 0; i < pageRows.length; i++) {
                    const row = pageRows[i];
                    const rowEmbed = new EmbedBuilder()
                        .setTitle(`投稿 by ${row.author_username}`)
                        .setDescription(row.content)
                        .addFields({ name: 'サーバー', value: row.guild_name || '不明' })
                        .setColor(0x9900FF) // グローバルフィード用の紫色
                        .setTimestamp(new Date(row.created_at))
                        .setFooter({ text: `ID: ${row.id} | いいね: ${row.likes}` });
                    if (row.image_url) {
                        rowEmbed.setImage(row.image_url);
                    }
                    embeds.push(rowEmbed);
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
                        allRows: rows,
                        currentPage: page,
                        totalPages: totalPages,
                        userId: interaction.user.id,
                        title: '全サーバーの公開投稿',
                        messageId: pageMessageId
                    });
                }

                await interaction.editReply({
                    content: `全サーバーの公開投稿 - ${page + 1}/${totalPages}ページ`,
                    embeds: embeds,
                    components: allComponents
                });
            };

            await interaction.reply({ content: 'グローバルフィードを読み込み中...', withResponse: true });
            await displayPage(currentPage);
        });
    },
    async handlePageButton(interaction) {
        const [action, _, pageMessageId] = interaction.customId.split('_');
        const pageData = interaction.client.pageInteractions.get(pageMessageId);
        
        if (!pageData || interaction.user.id !== pageData.userId) {
            await interaction.reply({ content: 'この操作はできません。', flags: 64 });
            return;
        }

        const allRows = pageData.allRows;
        let currentPage = pageData.currentPage;
        const totalPages = pageData.totalPages;
        const title = pageData.title;
        const limit = 5;

        if (action === 'next' && currentPage < totalPages - 1) {
            currentPage++;
        } else if (action === 'prev' && currentPage > 0) {
            currentPage--;
        } else {
            await interaction.reply({ content: 'これ以上ページを移動できません。', flags: 64 });
            return;
        }

        const start = currentPage * limit;
        const end = start + limit;
        const pageRows = allRows.slice(start, end);

        const embeds = [];
        const allComponents = [];

        for (let i = 0; i < pageRows.length; i++) {
            const row = pageRows[i];
            // 画像URLが存在する場合は本文の最後に追加して、本文直後にプレビュー表示させる
            const description = row.image_url ? `${row.content}\n${row.image_url}` : row.content;
            const rowEmbed = new EmbedBuilder()
                .setTitle(`投稿 by ${row.author_username}`)
                .setDescription(description)
                .addFields({ name: 'サーバー', value: row.guild_name || '不明' })
                .setColor(0x9900FF)
                .setTimestamp(new Date(row.created_at))
                .setFooter({ text: `ID: ${row.id} | いいね: ${row.likes}` });
            embeds.push(rowEmbed);
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
            content: `${title} - ${currentPage + 1}/${totalPages}ページ`,
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