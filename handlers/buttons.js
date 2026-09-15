const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { Like, Reply, Post } = require('../database');

module.exports = async function handleButtonInteraction(interaction) {
  // いいねボタンの処理
  if (interaction.customId.startsWith('like_')) {
    // like_の後の全ての文字列を結合して元のpost.idを復元（post.idに_が含まれる場合に対応）
    const postId = interaction.customId.slice(5); // 'like_'の5文字を削除
    const existingLike = await Like.findOne({ where: { userId: interaction.user.id, postId } });
    
    if (existingLike) {
      await existingLike.destroy();
      return interaction.reply({ content: 'いいねを取り消しました。', flags: 64 });
    } else {
      await Like.create({ userId: interaction.user.id, postId });
      return interaction.reply({ content: 'いいねしました！', flags: 64 });
    }
  }

  // リプライボタンの処理
  if (interaction.customId.startsWith('reply_')) {
    if (interaction.replied || interaction.deferred) return;
    // reply_の後の文字列を分割してpostIdとparentReplyIdを取得
    const remaining = interaction.customId.slice(6); // 'reply_'の6文字を削除
    const parts = remaining.split('_');
    const postId = parts[0];
    let parentReplyId = null;
    if (parts.length > 1) {
      parentReplyId = parts[1];
    }

    const modal = new ModalBuilder()
      .setCustomId(`reply_modal_${postId}${parentReplyId ? `_${parentReplyId}` : ''}`)
      .setTitle('リプライを投稿');

    const contentInput = new TextInputBuilder()
      .setCustomId('reply_content')
      .setLabel('リプライ内容')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2000);

    const parentReplyIdInput = new TextInputBuilder()
      .setCustomId('parent_reply_id')
      .setLabel('親リプライID（任意）')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    if (parentReplyId) {
      parentReplyIdInput.setValue(parentReplyId.toString());
    }

    const firstActionRow = new ActionRowBuilder().addComponents(contentInput);
    const secondActionRow = new ActionRowBuilder().addComponents(parentReplyIdInput);

    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  }

  // 投稿削除ボタンの処理
  if (interaction.customId.startsWith('delete_post_button_')) {
    if (interaction.replied || interaction.deferred) return;
    // 投稿IDを抽出
    const postId = interaction.customId.replace('delete_post_button_', '');
    const modal = new ModalBuilder()
      .setCustomId(`delete_post_modal_${postId}`)
      .setTitle('本当に投稿を削除しますか？');

    const confirmInput = new TextInputBuilder()
      .setCustomId('delete_confirm')
      .setLabel('削除する場合は「DELETE」と入力してください')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(confirmInput);
    modal.addComponents(firstActionRow);
    await interaction.showModal(modal);
  }

  // リプライ削除ボタンの処理
  if (interaction.customId.startsWith('delete_reply_button_')) {
    if (interaction.replied || interaction.deferred) return;
    // リプライIDを抽出
    const replyId = interaction.customId.replace('delete_reply_button_', '');
    const modal = new ModalBuilder()
      .setCustomId(`delete_reply_modal_${replyId}`)
      .setTitle('本当にリプライを削除しますか？');

    const confirmInput = new TextInputBuilder()
      .setCustomId('delete_confirm')
      .setLabel('削除する場合は「DELETE」と入力してください')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(confirmInput);
    modal.addComponents(firstActionRow);
    await interaction.showModal(modal);
  }

  // 投稿作成ボタンの処理
  if (interaction.customId === 'post_public' || interaction.customId === 'post_private') {
    if (interaction.replied || interaction.deferred) return;
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
      .setLabel('画像/動画URL（任意）')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
    
    const firstActionRow = new ActionRowBuilder().addComponents(contentInput);
    const secondActionRow = new ActionRowBuilder().addComponents(imageInput);
    
    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  }
};