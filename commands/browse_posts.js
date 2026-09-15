const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { Post, Reply, Like } = require('../database');
const { createPostDetailEmbed } = require('../utils/embeds');

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

    const message = await interaction.reply({
      embeds: initialPostData.embeds,
      components: initialPostData.components,
      fetchReply: true // メッセージオブジェクトを取得するために必要
    });

    await message.react('◀️');
    await message.react('▶️');

    const filter = (reaction, user) => {
      return ['◀️', '▶️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
    };

    const collector = message.createReactionCollector({ filter });

    collector.on('collect', async (reaction, user) => {
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

      // ユーザーのリアクションを削除
      reaction.users.remove(user.id);
    });

    collector.on('end', async collected => {
      // コレクターが終了したら、メッセージからすべてのリアクションを削除
      if (message && !message.deleted) {
        await message.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
      }
    });
  }
};