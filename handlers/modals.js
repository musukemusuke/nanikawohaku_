const { Post, Reply } = require('../database');

module.exports = async function handleModalSubmit(interaction) {
  // 投稿作成モーダルの処理
  if (interaction.customId.startsWith('post_modal_')) {
    const isPrivate = interaction.customId.includes('true');
    const content = interaction.fields.getTextInputValue('post_content');
    let imageUrl = null;
    try {
      imageUrl = interaction.fields.getTextInputValue('post_image');
    } catch (e) {
      imageUrl = null;
    }

    await Post.create({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      username: interaction.user.username,
      content,
      imageUrl,
      isPrivate
    });

    return interaction.reply({ content: '投稿が完了しました！', flags: 64 });
  }

  // リプライ作成モーダルの処理
  if (interaction.customId.startsWith('reply_modal_')) {
    // reply_modal_の後の全ての文字列をpostIdとして取得（IDに_が含まれても問題ない）
    const postId = interaction.customId.slice(12); // 'reply_modal_'の12文字を削除（正しい長さ）
    console.log('postId:', postId);
    let parentReplyId = null;

    // モーダルから親リプライIDを取得（必須でないフィールドなので、未入力の場合はnullを代入）
    try {
      const parentReplyIdInput = interaction.fields.getTextInputValue('parent_reply_id');
      if (parentReplyIdInput) {
        parentReplyId = parentReplyIdInput;
      }
    } catch (e) {
      parentReplyId = null;
    }

    const content = interaction.fields.getTextInputValue('reply_content');

    await Reply.create({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      username: interaction.user.username,
      postId,
      parentId: parentReplyId,
      content
    });

    return interaction.reply({ content: 'リプライが完了しました！', flags: 64 });
  }

  // 投稿削除モーダルの処理
  if (interaction.customId.startsWith('delete_post_modal_')) {
    const postId = interaction.customId.replace('delete_post_modal_', '');
    const confirm = interaction.fields.getTextInputValue('delete_confirm');
    if (confirm !== 'DELETE') {
      return interaction.reply({ content: '削除がキャンセルされました。', flags: 64 });
    }

    // クリックされた特定の投稿を削除
    const userPost = await Post.findOne({
      where: { 
        id: postId,
        userId: interaction.user.id // 自分の投稿以外は削除できないように保護
      }
    });

    if (userPost) {
      await userPost.destroy();
      return interaction.reply({ content: '投稿を削除しました。', flags: 64 });
    } else {
      return interaction.reply({ content: '削除する投稿が見つかりませんでした。', flags: 64 });
    }
  }

  // リプライ削除モーダルの処理
  if (interaction.customId.startsWith('delete_reply_modal_')) {
    const replyId = interaction.customId.replace('delete_reply_modal_', '');
    const confirm = interaction.fields.getTextInputValue('delete_confirm');
    if (confirm !== 'DELETE') {
      return interaction.reply({ content: '削除がキャンセルされました。', flags: 64 });
    }

    // クリックされた特定のリプライを削除
    const userReply = await Reply.findOne({
      where: { 
        id: replyId,
        userId: interaction.user.id // 自分のリプライ以外は削除できないように保護
      }
    });

    if (userReply) {
      // 親リプライが削除されたら、子リプライのparentIdをnullに設定して detached にする
      await Reply.update(
        { parentId: null },
        { where: { parentId: userReply.id } }
      );
      await userReply.destroy();
      return interaction.reply({ content: 'リプライを削除しました。', flags: 64 });
    } else {
      return interaction.reply({ content: '削除するリプライが見つかりませんでした。', flags: 64 });
    }
  }
};