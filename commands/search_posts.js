const { ActionRowBuilder, ModalBuilder, TextInputBuilder, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Post, Reply, Like } = require('../database');
const { Op } = require('sequelize');

// 投稿一覧Embed作成関数
function createPostListEmbed(posts, isPrivateView = false) {
  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('検索結果')
    .setTimestamp(new Date()); // リスト生成時刻を表示
  
  let description = '';
  posts.forEach(post => {
    if (!post) return; // 投稿が存在しない場合はスキップ
    const statusIcon = post.isPrivate ? '🔒' : '🌐';
    const imageIcon = post.imageUrl ? '🖼️ ' : ''; // 画像がある場合にアイコンを追加
    const content = isPrivateView || !post.isPrivate ? post.content.substring(0, 150) : '██████████████████████████'; // 表示文字数を150に増やす
    
    // 投稿日時をフォーマット
    const postDate = new Date(post.createdAt);
    const now = new Date();
    const isToday = postDate.toDateString() === now.toDateString();
    const timeString = isToday 
      ? `今日 ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`
      : `${postDate.getFullYear()}/${(postDate.getMonth() + 1).toString().padStart(2, '0')}/${postDate.getDate().toString().padStart(2, '0')} ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`;

    // リプライ数を取得 (post.Replies が配列として含まれていることを想定)
    const replyCount = post.Replies ? post.Replies.length : 0;

    description += `**投稿ID:** ${post.id}\n`;
    description += `${statusIcon} ${imageIcon}${post.username}: ${content}${post.content.length > 150 ? '...' : ''}\n`;
    description += `❤️${post.Likes ? post.Likes.length : 0} 💬${replyCount} | ${timeString}\n\n`;
  });
  
  if (description === '') {
    description = '該当する投稿がありません';
  }
  
  embed.setDescription(description);
  return embed;
}

// リプライを階層的にフォーマットするヘルパー関数
async function formatReplies(replies, guild, parentId = null, depth = 0) {
  let result = '';
  const indent = '  '.repeat(depth); // 深さに応じたインデント
  const repliesToProcess = replies.filter(r => r.parentId === parentId);

  for (const reply of repliesToProcess) {
      const user = await guild.client.users.fetch(reply.userId);
      const member = guild.members.cache.get(reply.userId);
      const displayName = member ? member.displayName : user.username;
      const date = new Date(reply.createdAt);
      const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
      result += `${indent}💬 **${displayName} (@${user.username})**: ${reply.content} (${dateStr})\n`;
      // 再帰的に子リプライを処理
      result += await formatReplies(replies, guild, reply.id, depth + 1);
      }
  return result;
}

// 投稿詳細Embed作成関数
async function createPostDetailEmbed(post, interactionUser, guild) {
  const baseEmbed = new EmbedBuilder()
    .setColor(post.isPrivate ? '#FF6B6B' : '#1DA1F2')
    .setAuthor({ name: post.username });

  // リプライを階層化して文字列化
  const formattedReplies = await formatReplies(post.Replies, guild);

  const likeUsers = await Promise.all(post.Likes.map(async like => {
    const user = await guild.client.users.fetch(like.userId);
    const member = guild.members.cache.get(like.userId);
    const displayName = member ? member.displayName : user.username;
    return `${displayName} (@${user.username})`;
  }));
  
  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`${post.content}`)
      .setImage(post.imageUrl)
      .setTimestamp(post.createdAt);

    const embeds = [contentEmbed]; // Start with content embed

    const metadataEmbed = new EmbedBuilder()
      .setColor(baseEmbed.data.color)
      .addFields(
        { name: '投稿ID', value: `${post.id}`, inline: true },
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      );
    embeds.push(metadataEmbed); // Add metadata embed

    // リプライがあれば追加
    if (formattedReplies.trim()) {
      const repliesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) });
      embeds.push(repliesEmbed);
    }

    // いいねがあれば追加
    if (likeUsers.length > 0) {
      const likesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: `❤️ ${likeUsers.length}件のいいね`, value: likeUsers.join(', ') });
      embeds.push(likesEmbed);
    } else {
      const likesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: `❤️ 0件のいいね`, value: 'まだいいねはありません' });
      embeds.push(likesEmbed);
    }

    return embeds;
  } else {
      const contentEmbed = new EmbedBuilder(baseEmbed)
        .setDescription(`${post.content}`)
        .setTimestamp(post.createdAt);

      const embeds = [contentEmbed]; // Start with content embed

      const metadataEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields(
          { name: '投稿ID', value: `${post.id}`, inline: true },
          { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
        );
      embeds.push(metadataEmbed); // Add metadata embed

      // リプライがあれば追加
      if (formattedReplies.trim()) {
        const repliesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) });
        embeds.push(repliesEmbed);
      }

      // いいねがあれば追加
      if (likeUsers.length > 0) {
        const likesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: `❤️ ${likeUsers.length}件のいいね`, value: likeUsers.join(', ') });
        embeds.push(likesEmbed);
      } else {
        const likesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: `❤️ 0件のいいね`, value: 'まだいいねはありません' });
        embeds.push(likesEmbed);
      }

      return embeds;
    }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search_posts')
    .setDescription('投稿をキーワードで検索します')
    .addStringOption(option =>
      option.setName('keyword')
        .setDescription('検索するキーワード')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('postid')
        .setDescription('検索する投稿のID')
        .setRequired(false)),
  longDescription: '現在のサーバーの公開投稿を検索できます。\n・キーワードで投稿内容を検索、または投稿IDで直接検索可能\n・検索結果からbrowse_postsと同様に絵文字リアクションでいいねやリプライを行えます。',
  async execute(interaction) {
    const keyword = interaction.options.getString('keyword');
    const postid = interaction.options.getString('postid');

    // 検索条件を動的に構築
    const whereClause = { isPrivate: false, guildId: interaction.guild.id };
    if (keyword) {
      whereClause.content = { [Op.like]: `%${keyword}%` };
    }
    if (postid && !isNaN(parseInt(postid))) {
      whereClause.id = parseInt(postid);
    }

    // 条件に合致する投稿を検索
    const posts = await Post.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [Reply, Like]
    });

    if (posts.length === 0) {
      return interaction.reply({ content: 'まだ公開投稿がありません。', ephemeral: true });
    }

    for (const post of posts) {
      const postEmbeds = await createPostDetailEmbed(post, interaction.user, interaction.guild);

      const messageOptions = {
        embeds: postEmbeds,
        ephemeral: true,
        fetchReply: true
      };

      const sentMessage = await (posts.indexOf(post) === 0 ? interaction.reply(messageOptions) : interaction.followUp(messageOptions));

      await sentMessage.react('❤️');
      await sentMessage.react('💬');

      const filter = (reaction, user) => {
        return ['❤️', '💬'].includes(reaction.emoji.name) && user.id === interaction.user.id;
      };

      const collector = sentMessage.createReactionCollector({ filter, time: 60000 }); // 60秒間反応を待つ

      collector.on('collect', async (reaction, user) => {
        await reaction.users.remove(user.id); // ユーザーのリアクションを削除

        if (reaction.emoji.name === '❤️') {
          const existingLike = await Like.findOne({ where: { userId: user.id, postId: post.id } });

          if (existingLike) {
            await existingLike.destroy();
            await interaction.followUp({ content: 'いいねを取り消しました。', ephemeral: true });
          } else {
            await Like.create({ userId: user.id, postId: post.id });
            await interaction.followUp({ content: 'いいねしました！', ephemeral: true });
          }
          // Embedを更新していいね数を反映
          const updatedPost = await Post.findByPk(post.id, { include: [Reply, Like] });
          const updatedEmbeds = await createPostDetailEmbed(updatedPost, interaction.user, interaction.guild);
          await sentMessage.edit({ embeds: updatedEmbeds });

        } else if (reaction.emoji.name === '💬') {
          const modal = new ModalBuilder()
            .setCustomId(`reply_modal_${post.id}`)
            .setTitle('リプライを送信');

          const replyContentInput = new TextInputBuilder()
            .setCustomId('reply_content')
            .setLabel('リプライ内容')
            .setStyle(2) // Paragraph
            .setRequired(true)
            .setMaxLength(500);

          const firstActionRow = new ActionRowBuilder().addComponents(replyContentInput);
          modal.addComponents(firstActionRow);

          await interaction.showModal(modal);
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          // console.log('リアクションがありませんでした。');
        }
        // メッセージからリアクションを削除
        sentMessage.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
      });
    }
  },
  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('reply_modal_')) {
      await interaction.deferReply({ ephemeral: true });
      const postId = interaction.customId.split('_')[2];
      const replyContent = interaction.fields.getTextInputValue('reply_content');
      try {
        await Reply.create({ postId, userId: interaction.user.id, username: interaction.user.username, content: replyContent });
        await interaction.editReply({ content: 'リプライを送信しました！', ephemeral: true });
      } catch (error) {
        console.error('リプライの保存中にエラーが発生しました:', error);
        await interaction.editReply({ content: 'リプライの送信中にエラーが発生しました。', ephemeral: true });
      }
    }
  }
};