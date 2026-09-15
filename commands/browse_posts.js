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

    const embedsAndComponents = [];
    for (const post of posts) {
      const likeUsers = await Promise.all(post.Likes.map(async like => {
        const user = await interaction.client.users.fetch(like.userId);
        return user.username;
      }));
      const postEmbeds = createPostDetailEmbed(post, likeUsers, post.Replies);

      const userLiked = await Like.findOne({ where: { userId: interaction.user.id, postId: post.id } });
      const likeButtonLabel = userLiked ? '❤️ いいね済み' : '❤️ いいね';
      const likeButtonStyle = userLiked ? ButtonStyle.Success : ButtonStyle.Primary;

      const baseActionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`like_${post.id}`)
            .setLabel(likeButtonLabel)
            .setStyle(likeButtonStyle),
          new ButtonBuilder()
            .setCustomId(`reply_${post.id}`)
            .setLabel('💬 投稿にリプライ')
            .setStyle(ButtonStyle.Secondary)
        );
      embedsAndComponents.push({ embeds: postEmbeds, components: [baseActionRow] });
    }

    if (embedsAndComponents.length > 0) {
      await interaction.reply({
        embeds: embedsAndComponents[0].embeds,
        components: embedsAndComponents[0].components,
        flags: 64
      });
      for (let i = 1; i < embedsAndComponents.length; i++) {
        await interaction.followUp({
          embeds: embedsAndComponents[i].embeds || [],
          components: embedsAndComponents[i].components || [],
          flags: 64
        });
      }
      return;
    } else {
      return interaction.reply({ content: '該当する投稿が見つかりませんでした。', flags: 64 });
    }
  }
};