const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feed')
        .setDescription('投稿フィードを表示します。')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('表示する投稿の種類を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '🌐', value: 'public' },
                    { name: '📝', value: 'my_posts' },
                    { name: '💬', value: 'my_replies' },
                    { name: '❤️', value: 'my_likes' }
                )),
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const channel = interaction.channel;

        let query = '';
        let params = [];
        let title = '';

        switch (type) {
            case 'public': // 最新の公開投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND is_private = 0 ORDER BY created_at DESC LIMIT 5`;
                params = [guildId];
                title = '最新の公開投稿';
                break;
            case 'my_posts': // 自分の投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [guildId, userId];
                title = 'あなたの投稿';
                break;
            case 'my_replies': // 自分が投稿したリプライ
                query = `SELECT * FROM replies WHERE author_id = ? AND guild_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [userId, guildId];
                title = 'あなたが投稿したリプライ';
                break;
            case 'my_likes': // 自分がいいねした投稿
                query = `SELECT posts.* FROM posts JOIN user_likes ON posts.id = user_likes.post_id WHERE posts.guild_id = ? AND user_likes.user_id = ? ORDER BY posts.created_at DESC LIMIT 5`;
                params = [guildId, userId];
                title = 'あなたがいいねした投稿';
                break;
        }

        // 以降の表示処理を実行
        db.all(query, params, async (err, posts) => {
            if (err) {
                console.error('Error getting posts:', err);
                await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 }); // ephemeral
                return;
            }
            console.log('feedで取得したposts:', posts); // デバッグ用ログ追加
            if (posts.length === 0) {
                await interaction.reply({ content: '該当する投稿がありませんでした。', flags: 64 }); // ephemeral
                return;
            }

            const embeds = await Promise.all(posts.map(async item => {
                const isReply = type === 'my_replies';
                const member = await interaction.guild.members.fetch(item.author_id).catch(() => null);
                const displayName = member ? member.displayName : item.author_username;
                const embed = new EmbedBuilder()
                    .setTitle(`${isReply ? 'リプライID' : '投稿ID'}: ${item.id}`)
                    .setAuthor({ name: `${displayName} (@${item.author_username})` }) // ニックネーム + ユーザー名
                    .setDescription(item.content)
                    .setColor(0x0099FF)
                    .setTimestamp(new Date(item.created_at));
                if (item.image_url) embed.setImage(item.image_url);
                return embed;
            }));

            await interaction.reply({ embeds, flags: 64 }); // ephemeral
        });
    },
    async handleReaction(reaction, user, originalInteraction) {
        const db = originalInteraction.client.db;
        const guildId = originalInteraction.guild.id;
        const userId = user.id;
        const channel = originalInteraction.channel;

        let query = '';
        let params = [];
        let title = '';

        switch (reaction.emoji.name) {
            case '🌐': // 最新の公開投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND is_private = 0 ORDER BY created_at DESC LIMIT 5`;
                params = [guildId];
                title = '最新の公開投稿';
                break;
            case '📝': // 自分の投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [guildId, userId];
                title = 'あなたの投稿';
                break;
            case '💬': // 自分が投稿したリプライ
                query = `SELECT * FROM replies WHERE author_id = ? AND guild_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [userId, guildId];
                title = 'あなたが投稿したリプライ';
                break;
            case '❤️': // 自分がいいねした投稿
                query = `SELECT p.* FROM posts p JOIN user_likes ul ON p.id = ul.post_id WHERE ul.user_id = ? AND p.guild_id = ? ORDER BY p.created_at DESC LIMIT 5`;
                params = [userId, guildId];
                title = 'あなたが「いいね」した投稿';
                break;
            case '❌': // キャンセル
                try {
                    await originalInteraction.editReply({ content: 'フィード表示をキャンセルしました。' });
                } catch (editErr) {
                    if (editErr.code !== 10008) {
                        console.error('Error editing reply:', editErr);
                    }
                }
                originalInteraction.client.feedInteractions.delete(reaction.message.id);
                return;
            default:
                return;
        }

        // リアクションメッセージを削除してからembedを表示
        await reaction.message.delete();
        
        db.all(query, params, async (err, rows) => {
            if (err) {
                console.error('Error fetching posts from database:', err.message);
                try {
                    await originalInteraction.editReply({ content: '投稿の取得中にエラーが発生しました。' });
                } catch (editErr) {
                    if (editErr.code !== 10008) {
                        console.error('Error editing reply:', editErr);
                    }
                }
                originalInteraction.client.feedInteractions.delete(reaction.message.id);
                return;
            }

            if (rows.length === 0) {
                try {
                    await originalInteraction.editReply({ content: `${title} はまだありません。` });
                } catch (err) {
                    if (err.code !== 10008) { // Unknown Message以外のエラーのみログ出力
                        console.error('Error editing reply:', err);
                    }
                }
                originalInteraction.client.feedInteractions.delete(reaction.message.id);
                return;
            }

            // ページングのための初期処理
            const limit = 5;
            let currentPage = 0;
            const totalPages = Math.ceil(rows.length / limit);

            // 最初のページを表示
            const displayPage = async (page) => {
                const start = page * limit;
                const end = start + limit;
                const pageRows = rows.slice(start, end);

                // 全ての投稿をembedの配列にまとめる
            const embeds = [];
            const allComponents = [];

            for (let i = 0; i < pageRows.length; i++) {
                const row = pageRows[i];
                let rowEmbed;
                if (row.post_id) { // リプライの場合（repliesテーブルの行）
                    rowEmbed = new EmbedBuilder()
                        .setTitle(`リプライ by ${row.author_username}`)
                        .setDescription(row.content)
                        .addFields({ name: '元の投稿ID', value: row.post_id })
                        .setColor(0x0099FF)
                        .setTimestamp(new Date(row.created_at))
                        .setFooter({ text: `リプライID: ${row.id}` });
                } else { // 通常の投稿の場合（postsテーブルの行）
                    rowEmbed = new EmbedBuilder()
                        .setTitle(`投稿 by ${row.author_username}`)
                        .setDescription(row.content)
                        .setColor(0x00FF00)
                        .setTimestamp(new Date(row.created_at))
                        .setFooter({ text: `ID: ${row.id} | いいね: ${row.likes}` });
                    if (row.image_url) {
                        rowEmbed.setImage(row.image_url);
                    }
                }
                embeds.push(rowEmbed);
            }

            // ページングボタンも追加
            if (totalPages > 1) {
                const pageMessageId = originalInteraction.id;
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

                const pageRow = new ActionRowBuilder()
                    .addComponents(prevButton, nextButton);
                allComponents.push(pageRow);

                originalInteraction.client.pageInteractions.set(pageMessageId, {
                    originalInteraction: originalInteraction,
                    query: query,
                    params: params,
                    title: title,
                    allRows: rows,
                    currentPage: page,
                    totalPages: totalPages,
                    userId: user.id,
                    messageId: pageMessageId
                });
            }

            // エフェメラルで一括更新（元のメッセージを置き換え）
            await originalInteraction.editReply({
                content: `${title} - ${page + 1}/${totalPages}ページ`,
                embeds: embeds,
                components: allComponents
            });
            };

            await displayPage(currentPage);
            originalInteraction.client.feedInteractions.delete(reaction.message.id);
        });
    },
    async handlePageButton(interaction) {
        // タイムアウト回避のため最初にdeferUpdate
        await interaction.deferUpdate();
        const [action, _, pageMessageId] = interaction.customId.split('_');
        const pageData = interaction.client.pageInteractions.get(pageMessageId);
        
        if (!pageData || interaction.user.id !== pageData.userId) {
            await interaction.reply({ content: 'この操作はできません。', flags: 64 });
            return;
        }

        const db = interaction.client.db;
        const channel = interaction.channel;
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

        // 新しいページを表示
        const start = currentPage * limit;
        const end = start + limit;
        const pageRows = allRows.slice(start, end);

        // 全ての投稿をembedの配列にまとめる
        const embeds = [];
        const allComponents = [];

        for (let i = 0; i < pageRows.length; i++) {
            const row = pageRows[i];
            let rowEmbed;
            if (row.post_id) { // リプライの場合（repliesテーブルの行）
                rowEmbed = new EmbedBuilder()
                    .setTitle(`リプライ by ${row.author_username}`)
                    .setDescription(row.content)
                    .addFields({ name: '元の投稿ID', value: row.post_id })
                    .setColor(0x0099FF)
                    .setTimestamp(new Date(row.created_at))
                    .setFooter({ text: `リプライID: ${row.id}` });
            } else { // 通常の投稿の場合（postsテーブルの行）
                const description = row.image_url ? `${row.content}\n${row.image_url}` : row.content;
                rowEmbed = new EmbedBuilder()
                    .setTitle(`投稿 by ${row.author_username}`)
                    .setDescription(description)
                    .setColor(0x00FF00)
                    .setTimestamp(new Date(row.created_at))
                    .setFooter({ text: `ID: ${row.id} | いいね: ${row.likes}` });
            }
            embeds.push(rowEmbed);
        }

        // ページングボタンも追加
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

            const pageRow = new ActionRowBuilder()
                .addComponents(newPrevButton, newNextButton);
            allComponents.push(pageRow);
        }

        // 一括更新（元のメッセージを置き換え）
        await pageData.originalInteraction.editReply({
            content: `${title} - ${currentPage + 1}/${totalPages}ページ`,
            embeds: embeds,
            components: allComponents
        });

        await interaction.update({});

        // pageDataのcurrentPageを更新
        const updatedPageData = interaction.client.pageInteractions.get(pageMessageId);
        if (updatedPageData) {
            updatedPageData.currentPage = currentPage;
            interaction.client.pageInteractions.set(pageMessageId, updatedPageData);
        }
    }

};