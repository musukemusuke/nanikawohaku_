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

    // 前後に移動するためのナビゲーションボタンを追加
    const navRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('prev_post')
          .setLabel('◀️ 前へ')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('next_post')
          .setLabel('次へ ▶️')
          .setStyle(ButtonStyle.Secondary)
      );

    // 初期のコンポーネントにナビゲーションボタンを追加
    const initialComponents = [...initialPostData.components, navRow];
    const response = await interaction.reply({
      embeds: initialPostData.embeds,
      components: initialComponents
    }).withResponse();
    const message = response.message;

    // ボタンによるナビゲーションハンドラー（常に動作）
    const buttonFilter = i => ['prev_post', 'next_post'].includes(i.customId) && i.user.id === interaction.user.id;
    const buttonCollector = message.createMessageComponentCollector({ filter: buttonFilter });

    buttonCollector.on('collect', async i => {
      if (i.customId === 'prev_post') {
        currentIndex = (currentIndex - 1 + posts.length) % posts.length;
      } else if (i.customId === 'next_post') {
        currentIndex = (currentIndex + 1) % posts.length;
      }

      const newPostData = await fetchAndSendPost(currentIndex);
      const newPostComponents = [...newPostData.components, navRow];
      await i.update({
        embeds: newPostData.embeds,
        components: newPostComponents
      });
    });
  }
};