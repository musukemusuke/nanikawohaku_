const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Post, Reply, Like } = require('../database');

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

// 投稿一覧Embed作成関数
function createPostListEmbed(posts, isPrivateView = false) {
  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('投稿一覧')
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
    description = '投稿がありません';
  }
  
  embed.setDescription(description);
  return embed;
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
    .setName('browse_posts')
    .setDescription('現在のサーバーの公開投稿を一覧表示します'),
  longDescription: '現在のサーバーの公開投稿を新しい順に一覧表示します。\n・ページ送りボタンで次の投稿に切り替え可能\n・各投稿にいいねを送信したり、リプライを書き込めます。',
  async execute(interaction) {
    // 全サーバー横断のクロスサーバー表示を廃止し、現在のサーバーの公開投稿のみを直接表示する
    // インタラクション回数を最小化し、ボタンの期限切れ（タイムアウト）を根本的に回避
    const posts = await Post.findAll({
      where: { isPrivate: false, guildId: interaction.guild.id },
      order: [['createdAt', 'DESC']],
      include: [Reply, Like]
    });

    if (posts.length === 0) {
      return interaction.reply({ content: 'まだ公開投稿がありません。', flags: 64 });
    }

    let currentIndex = 0;

    const fetchAndSendPost = async (index) => {
      const post = posts[index];
      const postEmbeds = await createPostDetailEmbed(post, interaction.user, interaction.guild);

      const userLiked = await Like.findOne({ where: { userId: interaction.user.id, postId: post.id } });
      const likeButtonLabel = userLiked ? '❤️ いいね済み' : '❤️ いいね';
      const likeButtonStyle = userLiked ? ButtonStyle.Success : ButtonStyle.Primary;

      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`like_button_${post.id}`)
            .setLabel(likeButtonLabel)
            .setStyle(likeButtonStyle),
          new ButtonBuilder()
            .setCustomId(`reply_button_${post.id}`)
            .setLabel('💬 投稿にリプライ')
            .setStyle(ButtonStyle.Secondary)
        );
      
      return { embeds: postEmbeds, components: [actionRow] };
    };

    const initialPostData = await fetchAndSendPost(currentIndex);

    await interaction.reply({
      embeds: initialPostData.embeds,
      components: initialPostData.components
    });
    const message = await interaction.fetchReply();

    // リアクション（矢印）によるナビゲーション
    try {
      await message.react('◀️');
      await message.react('▶️');

      const reactionFilter = (reaction, user) => {
        return ['◀️', '▶️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
      };

      const reactionCollector = message.createReactionCollector({ filter: reactionFilter });

      reactionCollector.on('collect', async (reaction, user) => {
        if (reaction.emoji.name === '◀️') {
          currentIndex = (currentIndex - 1 + posts.length) % posts.length;
        } else if (reaction.emoji.name === '▶️') {
          currentIndex = (currentIndex + 1) % posts.length;
        }

        const newPostData = await fetchAndSendPost(currentIndex);
        await message.edit({
          embeds: newPostData.embeds,
          components: newPostData.components
        });

        reaction.users.remove(user.id).catch(() => {});
      });

      reactionCollector.on('end', async () => {
        if (message && !message.deleted) {
          await message.reactions.removeAll().catch(() => {});
        }
      });
    } catch (error) {
      console.log('リアクションの追加に失敗しました:', error.message);
      await interaction.followUp({
        content: 'リアクションを追加できませんでした。ボットに「リアクションを追加」の権限があるか確認してください。',
        flags: 64
      });
    }
  }
};