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
      return interaction.reply({ content: 'まだ公開投稿がありません。', flags: 0 });
    }

    let currentIndex = 0;

    const fetchAndSendPost = async (index) => {
      const post = posts[index];
      const postEmbeds = await createPostDetailEmbed(post, interaction.user, interaction.guild);

      return { embeds: postEmbeds };
    };

    const initialPostData = await fetchAndSendPost(currentIndex);

    await interaction.reply({
      embeds: initialPostData.embeds,
      fetchReply: true // メッセージオブジェクトを取得
    });
    const message = await interaction.fetchReply();

    // リアクションによるナビゲーション、いいね、リプライ
    try {
      await message.react('◀️');
      await message.react('▶️');
      await message.react('❤️'); // いいねリアクションを追加
      await message.react('💬'); // リプライリアクションを追加
      await message.react('❌'); // 閉じるための絵文字リアクションを追加

      const reactionFilter = (reaction, user) => {
        // ナビゲーション、いいね、リプライ、閉じるのリアクションと、コマンド実行ユーザーからのもののみを収集
        return ['◀️', '▶️', '❤️', '💬', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
      };

      const reactionCollector = message.createReactionCollector({ filter: reactionFilter, time: 180000 }); // 3分間有効

      reactionCollector.on('collect', async (reaction, user) => {
        const currentPost = posts[currentIndex]; // 現在表示されている投稿

        if (reaction.emoji.name === '◀️') {
          currentIndex = (currentIndex - 1 + posts.length) % posts.length;
        } else if (reaction.emoji.name === '▶️') {
          currentIndex = (currentIndex + 1) % posts.length;
        } else if (reaction.emoji.name === '❤️') {
          // いいね処理
          const existingLike = await Like.findOne({ where: { userId: user.id, postId: currentPost.id } });
          if (existingLike) {
            await existingLike.destroy();
            await interaction.followUp({ content: 'いいねを取り消しました。', flags: 64 });
          } else {
            await Like.create({ userId: user.id, postId: currentPost.id });
            await interaction.followUp({ content: 'いいねしました！', flags: 64 });
          }
          // いいね数の更新のため、Embedを再生成
          const updatedPost = await Post.findByPk(currentPost.id, { include: [Reply, Like] });
          const newPostData = await fetchAndSendPost(currentIndex);
          await message.edit({ embeds: newPostData.embeds });
        } else if (reaction.emoji.name === '💬') {
          // リプライ処理 (モーダルを表示)
          const modal = new ModalBuilder()
            .setCustomId(`reply_modal_${currentPost.id}`)
            .setTitle('リプライを送信');

          const replyInput = new TextInputBuilder()
            .setCustomId('reply_content')
            .setLabel('リプライ内容')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1000);

          const firstActionRow = new ActionRowBuilder().addComponents(replyInput);
          modal.addComponents(firstActionRow);

          await interaction.showModal(modal);
        } else if (reaction.emoji.name === '❌') {
          await message.delete(); // メッセージを削除
        }

        // ナビゲーションの場合のみメッセージを更新
        if (['◀️', '▶️'].includes(reaction.emoji.name)) {
          const newPostData = await fetchAndSendPost(currentIndex);
          await message.edit({
            embeds: newPostData.embeds,
            components: [] // ボタンは常に空
          });
        }
        reaction.users.remove(user.id).catch(() => {}); // ユーザーのリアクションを削除
      });
        if (message && !message.deleted) {
          await message.reactions.removeAll().catch(() => {});
        }
      });
    } catch (error) {
      console.log('リアクションの追加に失敗しました:', error.message);
      await interaction.followUp({
        content: 'リアクションを追加できませんでした。ボットに「リアクションを追加」の権限があるか確認してください。'
      });
    }
  },

  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('reply_modal_')) {
      await interaction.deferReply();
      const postId = interaction.customId.split('_')[2];
      const replyContent = interaction.fields.getTextInputValue('reply_content');

      try {
        await Reply.create({
          postId: postId,
          userId: interaction.user.id,
          username: interaction.user.username,
          content: replyContent,
        });
        await interaction.editReply({ content: 'リプライを送信しました！' });
      } catch (error) {
        console.error('リプライの保存中にエラーが発生しました:', error);
        await interaction.editReply({ content: 'リプライの送信中にエラーが発生しました。' });
      }
    }
  }
};