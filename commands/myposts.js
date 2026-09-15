const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Post, Reply, Like } = require('../database');

// 自分の投稿詳細Embed作成関数
function createMyPostDetailEmbed(post) {
  const baseEmbed = new EmbedBuilder()
    .setColor(post.isPrivate ? '#FF6B6B' : '#1DA1F2')
    .setAuthor({ name: post.username });

  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}`)
      .setImage(post.imageUrl)
      .setTimestamp(post.createdAt);

    const metadataEmbed = new EmbedBuilder()
      .setColor(baseEmbed.data.color)
      .addFields(
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      );

    return [contentEmbed, metadataEmbed];

  } else {
    const singleEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}`)
      .addFields(
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      )
      .setTimestamp(post.createdAt);

    return [singleEmbed];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('myposts')
    .setDescription('自分の投稿一覧を表示します'),
  longDescription: '自分が作成した全投稿（公開/非公開両方）を新しい順に表示します。\n・不要になった投稿を削除可能\n・ページ送りボタンで次の投稿に切り替えられます。',
  async execute(interaction) {
    const userPosts = await Post.findAll({
      where: { userId: interaction.user.id },
      order: [['createdAt', 'DESC']],
      include: [Reply, Like]
    });

    if (userPosts.length === 0) {
      return interaction.reply({ content: 'まだ投稿していません。', flags: 64 });
    }

    const embedsAndComponents = [];
    for (const post of userPosts) {
      const likeUsers = await Promise.all(post.Likes.map(async like => {
        const user = await interaction.client.users.fetch(like.userId);
        return user.username;
      }));
      const postEmbeds = createMyPostDetailEmbed(post, likeUsers, []);

      // 投稿ごとに固有のIDをボタンに埋め込む
      const baseActionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`delete_post_button_${post.id}`)
            .setLabel('投稿を削除')
            .setStyle(ButtonStyle.Danger)
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
    } else {
      await interaction.reply({ content: '表示可能な投稿がありません。', flags: 64 });
    }
  }
};