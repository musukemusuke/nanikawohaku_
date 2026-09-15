const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require('discord.js');
const { Post, Like, Reply } = require('../database');
const { createPostPreviewEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('新しい投稿を作成します'),
  longDescription: '新規投稿を作成します。\n・公開（サーバーの全員が閲覧可能）または非公開を選択可能\n・非公開の場合、「自分だけ」または指定したユーザーIDのみ閲覧可能に設定できる\n・非公開投稿は/mypostsでのみ確認可能、他ユーザーのbrowse_postsには表示されません\n・最大2000文字のテキストに加え、画像/動画URLを1つ（任意）で投稿可能\n・YouTubeなどの動画URLはDiscordの自動埋め込みで表示されます\n・公開投稿は他ユーザーからのリプライやいいねを受け取れます。',
  async execute(interaction) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('post_public')
          .setLabel('🌐 公開')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('post_private')
          .setLabel('🔒 非公開')
          .setStyle(ButtonStyle.Danger)
      );
    
    await interaction.reply({ 
      content: '投稿の公開設定を選択してください', 
      components: [row], 
      flags: [64]
    });
  },
  
  async handleButton(interaction) {
    if (interaction.customId === 'post_public' || interaction.customId === 'post_private') {
      const isPrivate = interaction.customId === 'post_private';
      
      const modal = new ModalBuilder()
        .setCustomId(`post_modal_${isPrivate}`)
        .setTitle(isPrivate ? '非公開投稿を作成' : '公開投稿を作成');
      
      const contentInput = new TextInputBuilder()
        .setCustomId('post_content')
        .setLabel('投稿内容')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2000);
      
      const imageInput = new TextInputBuilder()
        .setCustomId('post_image')
        .setLabel('画像/動画URL (任意)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('例: `https://example.com/image.png` / `https://www.youtube.com/watch?v=xxxxxx`');
      
      const firstActionRow = new ActionRowBuilder().addComponents(contentInput);
      const secondActionRow = new ActionRowBuilder().addComponents(imageInput);
      
      modal.addComponents(firstActionRow, secondActionRow);

      if (isPrivate) {
        const allowedUsersInput = new TextInputBuilder()
          .setCustomId('allowed_users')
          .setLabel('閲覧を許可するユーザーID (カンマ区切り、任意)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const thirdActionRow = new ActionRowBuilder().addComponents(allowedUsersInput);
        modal.addComponents(thirdActionRow);
      }
      
      await interaction.showModal(modal);
    }
    
    if (interaction.customId.startsWith('confirm_')) {
      const parts = interaction.customId.split('_');
      const isPrivateStr = parts[1];
      const content = decodeURIComponent(parts[2]);
      const imageUrl = decodeURIComponent(parts[3]);
      const allowedUsersStr = parts[4] || '';
      
      const isPrivate = isPrivateStr === 'true';
      const allowedUserIds = allowedUsersStr ? allowedUsersStr.split(',').map(id => id.trim()) : [];
      
      if (interaction.customId.startsWith('confirm_yes_')) {
        const newPost = await Post.create({
          userId: interaction.user.id,
          username: interaction.user.username,
          displayName: interaction.user.displayName,
          content: content,
          imageUrl: imageUrl || null,
          isPrivate: isPrivate,
          likes: 0,
          allowedUserIds: allowedUserIds
        });
        
        await interaction.update({ 
          content: `✅ 投稿が完了しました！投稿ID: ${newPost.id}`, 
          embeds: [], 
          components: [],
          flags: [64]
        });
      } else {
        await interaction.update({ 
          content: '投稿をキャンセルしました。もう一度/postコマンドから投稿を開始してください。', 
          embeds: [], 
          components: [],
          flags: [64]
        });
      }
    }
  },
  
  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('post_modal_')) {
      const isPrivate = interaction.customId.split('_')[2] === 'true';
      const content = interaction.fields.getTextInputValue('post_content');
      const imageUrl = interaction.fields.getTextInputValue('post_image') || null;
      const allowedUsers = interaction.fields.getTextInputValue('allowed_users') || '';
      
      const previewEmbed = createPostPreviewEmbed(interaction.user.displayName, interaction.user.username, content, imageUrl);
      
      const confirmationEmbed = new EmbedBuilder()
        .setColor('#FFA500') // オレンジ色など、注意を促す色
        .setDescription('この内容で投稿しますか？\n「はい」または「いいえ」を選択してください。');
      
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_yes_${isPrivate}_${encodeURIComponent(content)}_${encodeURIComponent(imageUrl || '')}_${encodeURIComponent(allowedUsers)}`)
            .setLabel('はい')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`confirm_no_${isPrivate}`)
            .setLabel('いいえ')
            .setStyle(ButtonStyle.Danger)
        );
      
      await interaction.reply({
        content: '投稿内容の確認',
        embeds: [previewEmbed, confirmationEmbed],
        components: [confirmRow],
        flags: [64]
      });
    }
  }
};