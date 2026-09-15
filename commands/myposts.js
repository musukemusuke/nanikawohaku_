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
      return interaction.reply({ content: 'まだ投稿していません。' });
    }

    // ページネーションを考慮し、最初の投稿のみを処理する例
    const post = userPosts[0]; // 最初の投稿を取得

    const likeUsers = await Promise.all(post.Likes.map(async like => {
      const user = await interaction.client.users.fetch(like.userId);
      return user.username;
    }));
    const postEmbeds = createMyPostDetailEmbed(post, likeUsers, []);

    await interaction.deferReply(); // deferReplyを追加

    const message = await interaction.editReply({
      embeds: postEmbeds,
      fetchReply: true
    });
    await message.react('🗑️'); // ゴミ箱の絵文字リアクションを追加
    await message.react('❌'); // 閉じるための絵文字リアクションを追加

    const filter = (reaction, user) => {
      return (reaction.emoji.name === '🗑️' || reaction.emoji.name === '❌') && user.id === interaction.user.id;
    };

    const collector = message.createReactionCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async (reaction, user) => {
      if (reaction.emoji.name === '🗑️') {
        await Post.destroy({ where: { id: post.id } });
        await interaction.editReply({
          content: `投稿ID: ${post.id} を削除しました。`,
          embeds: [],
          components: [],
        });
      } else if (reaction.emoji.name === '❌') {
        await message.delete(); // メッセージを削除
      }
      collector.stop();
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        message.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
      }
    });
  }
};