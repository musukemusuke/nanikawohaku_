const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
  longDescription: '自分が送信した全てのリプライを新しい順に一覧表示します。\n・各リプライの親投稿も同時に表示\n・不要になったリプライを削除可能です。',
  async execute(interaction) {
    const allReplies = await Reply.findAll({
      where: { userId: interaction.user.id },
      order: [['createdAt', 'DESC']],
      include: [Post]
    });

    if (allReplies.length === 0) {
      return interaction.reply({ content: 'まだリプライした投稿はありません。', flags: 64 });
    }

    const embedsAndComponents = [];
    for (const reply of allReplies) {
      if (!reply.Post) continue;

      const replyEmbed = createMyReplyEmbed(reply);
      if (!replyEmbed) continue;

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_reply_button_${reply.id}`)
          .setLabel('リプライを削除')
          .setStyle(ButtonStyle.Danger)
      );
      embedsAndComponents.push({ embeds: [replyEmbed], components: [actionRow] });
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
      await interaction.reply({ content: '表示可能なリプライがありません（元の投稿が削除されている可能性があります）。', flags: 64 });
    }
  }
};