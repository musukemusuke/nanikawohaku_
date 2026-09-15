const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { Reply, Post } = require('../database');
const { createMyReplyEmbed } = require('../utils/embeds');

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