const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Reply, Post } = require('../database');

// 自分のリプライEmbed作成関数
function createMyReplyEmbed(reply) {
  const post = reply.Post; // Original post
  if (!post) {
    return null; // Should not happen if include: Post is used, but for safety
  }

  const statusIcon = post.isPrivate ? '🔒' : '🌐';
  const imageIcon = post.imageUrl ? '🖼️ ' : '';
  const originalPostContentSnippet = post.content.substring(0, 80) + (post.content.length > 80 ? '...' : '');

  const replyDate = new Date(reply.createdAt);
  const now = new Date();
  const isToday = replyDate.toDateString() === now.toDateString();
  const replyTimeString = isToday
    ? `今日 ${replyDate.getHours().toString().padStart(2, '0')}:${replyDate.getMinutes().toString().padStart(2, '0')}`
    : `${replyDate.getFullYear()}/${(replyDate.getMonth() + 1).toString().padStart(2, '0')}/${replyDate.getDate().toString().padStart(2, '0')} ${replyDate.getHours().toString().padStart(2, '0')}:${replyDate.getMinutes().toString().padStart(2, '0')}`;

  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('あなたのリプライ')
    .setAuthor({ name: reply.username })
    .setDescription(
      `**リプライID:** ${reply.id}\n` +
      `**リプライ内容:** ${reply.content}\n\n` +
      `**元の投稿:**\n` +
      `${statusIcon} ${imageIcon}ID: ${post.id} | ${originalPostContentSnippet}\n`
    )
    .setFooter({ text: `リプライ日時: ${replyTimeString}` })
    .setTimestamp(reply.createdAt);

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('myreplies')
    .setDescription('自分のリプライ一覧を表示します'),
  longDescription: '自分が送信した全てのリプライを新しい順に一覧表示します。\n・各リプライの親投稿も同時に表示\n・不要になったリプライを絵文字リアクションで削除可能です。',
  async execute(interaction) {
    const allReplies = await Reply.findAll({
      where: { userId: interaction.user.id },
      order: [['createdAt', 'DESC']],
      include: [Post]
    });

    if (allReplies.length === 0) {
      return interaction.reply({ content: 'まだリプライした投稿はありません。', ephemeral: true });
    }

    for (const reply of allReplies) {
      if (!reply.Post) continue;

      const replyEmbed = createMyReplyEmbed(reply);
      if (!replyEmbed) continue;

      const messageOptions = {
        embeds: [replyEmbed],
        ephemeral: true,
        fetchReply: true
      };

      const sentMessage = await (allReplies.indexOf(reply) === 0 ? interaction.reply(messageOptions) : interaction.followUp(messageOptions));

      await sentMessage.react('🗑️');

      const filter = (reaction, user) => {
        return reaction.emoji.name === '🗑️' && user.id === interaction.user.id;
      };

      const collector = sentMessage.createReactionCollector({ filter, time: 60000 }); // 60秒間反応を待つ

      collector.on('collect', async (reaction, user) => {
        await reaction.users.remove(user.id); // ユーザーのリアクションを削除

        if (reaction.emoji.name === '🗑️') {
          await Reply.destroy({ where: { id: reply.id } });
          await interaction.followUp({ content: '🗑️ リプライを削除しました。', ephemeral: true });
          await sentMessage.delete(); // リプライメッセージ自体も削除
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          // console.log('リアクションがありませんでした。');
        }
        sentMessage.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
      });
    }
  }
};