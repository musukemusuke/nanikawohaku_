const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('利用可能なコマンド一覧を表示します')
    .setDMPermission(true),
  longDescription: 'このボットで利用できる全てのコマンドとその説明を表示します。',
  async execute(interaction, commands) {
    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('利用可能なコマンド一覧')
      .setDescription('このボットで利用できるコマンドとその説明です。');

    // 登録されている全てのコマンドをEmbedに追加
    commands.forEach(command => {
      if (command.data.name !== 'help') {
        helpEmbed.addFields({
          name: `/${command.data.name}`,
          value: command.longDescription || '説明がありません。',
          inline: false
        });
      }
    });

    await interaction.reply({ embeds: [helpEmbed], flags: 64 });
  }
};