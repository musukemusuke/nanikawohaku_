const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Post, Like, Reply } = require('../database');

// 投稿プレビュー用Embed作成関数
function createPostPreviewEmbed(username, content, imageUrl) {
  const embed = new EmbedBuilder()
    .setColor('#00FF00') // 緑色
    .setAuthor({ name: username })
    .setDescription(content)
    .setTimestamp(); // 引数なし

  if (imageUrl) {
    embed.setImage(imageUrl); // 画像を直接Embedに表示
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('新しい投稿を作成します'),
  longDescription: '新規投稿を作成します。\n・公開（サーバーの全員が閲覧可能）または非公開を選択可能\n・非公開の場合、「自分だけ」または指定したユーザーIDのみ閲覧可能に設定できる\n・非公開投稿は/mypostsでのみ確認可能、他ユーザーのbrowse_postsには表示されません\n・最大2000文字のテキストに加え、画像/動画URLを1つ（任意）で投稿可能\n・YouTubeなどの動画URLはDiscordの自動埋め込みで表示されます\n・公開投稿は他ユーザーからのリプライやいいねを受け取れます。',
  async execute(interaction) {
    await interaction.deferReply({ flags: 0 }); // deferReplyを追加

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
    
    await interaction.editReply({ 
      content: '投稿の公開設定を選択してください', 
      components: [row]
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
  },
  
  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('post_modal_')) {
      const isPrivate = interaction.customId.split('_')[2] === 'true';
      const content = interaction.fields.getTextInputValue('post_content');
      const imageUrl = interaction.fields.getTextInputValue('post_image') || null;
      let allowedUsers = '';
      try {
        allowedUsers = interaction.fields.getTextInputValue('allowed_users') || '';
      } catch (e) {
        // 公開投稿の場合allowed_usersフィールドが存在しないので空文字のまま
      }
      
      const previewEmbed = createPostPreviewEmbed(interaction.user.username, content, imageUrl);
      
      const confirmationEmbed = new EmbedBuilder()
        .setColor('#FFA500') // オレンジ色など、注意を促す色
        .setDescription('この内容で投稿しますか？\n✅ または ❌ を選択してください。');
      
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_yes_${isPrivate}_${encodeURIComponent(content)}_${encodeURIComponent(imageUrl || '')}_${encodeURIComponent(allowedUsers)}`)
            .setEmoji('✅') // OKの絵文字
            .setLabel('はい')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`confirm_no_${isPrivate}`)
            .setEmoji('❌') // NOの絵文字
            .setLabel('いいえ')
            .setStyle(ButtonStyle.Danger)
        );
      

      const message = await interaction.followUp({ // メッセージオブジェクトを取得するためにfollowUpの戻り値を変数に格納
        content: '投稿プレビュー',
        embeds: [previewEmbed, confirmationEmbed],
        flags: 0, // 明示的に非一時的メッセージとして設定
        fetchReply: true
        // components: [] // リアクションベースの確認のため、ボタンは不要
      });

      console.log('Message object after editReply:', message); // 追加するログ
      console.log('Message ID:', message ? message.id : 'No message ID'); // 追加するログ

      // メッセージにリアクションを追加
      await message.react('✅');
      await message.react('❌');

      // リアクションコレクターを作成
      const filter = (reaction, user) => {
        // 元のコマンドを実行したユーザーからの✅または❌のリアクションのみを収集
        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
      };

      // 60秒間リアクションを待ち、1つだけ収集
      const collector = message.createReactionCollector({ filter, time: 60000, max: 1 });

      collector.on('collect', async (reaction, user) => {
        if (reaction.emoji.name === '✅') {
          // ユーザーが確認した場合、投稿を作成
          const newPost = await Post.create({
            userId: interaction.user.id,
            username: interaction.user.username,
            content: content,
            imageUrl: imageUrl || null,
            isPrivate: isPrivate,
            likes: 0,
            allowedUserIds: allowedUsers ? allowedUsers.split(',').map(id => id.trim()) : [] // allowedUsers文字列をパース
          });

          await interaction.editReply({
            content: `✅ 投稿が完了しました！投稿ID: ${newPost.id}`,
            embeds: [],
            components: [],
          });
        } else if (reaction.emoji.name === '❌') {
          // ユーザーがキャンセルした場合
          await interaction.editReply({
            content: '投稿をキャンセルしました。もう一度/postコマンドから投稿を開始してください。',
            embeds: [],
            components: [],
          });
        }
        // 有効なリアクションが処理されたらコレクターを停止
        collector.stop();
      });

      collector.on('end', collected => {
        // タイムリミット内にリアクションがなかった場合
        if (collected.size === 0) {
          interaction.editReply({
            content: '時間内にリアクションがなかったため、投稿をキャンセルしました。',
            embeds: [],
            components: [],
          }).catch(console.error); // interactionが既に返信/編集されている場合の潜在的なエラーをキャッチ
        }
        // コレクター終了後、メッセージからすべてのリアクションを削除
        message.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
      });
    }
  }
};