const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('ボットの全コマンドの使い方を表示します'),
    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x1DA1F2)
            .setTitle('コマンドガイド')
            .setDescription('Discord上でTwitterライクな投稿ができるボットです。全ての操作はスラッシュコマンドで行い、実行結果は自分だけに表示されます。')
            .addFields(
                {
                    name: '📝 /post - 新規投稿作成',
                    value: '新しく投稿を作成するコマンドです。\n**手順**\n1. `/post`を実行するとモーダルが開く\n2. 投稿内容と画像URL（任意）を入力して送信\n\n✅ 投稿完了後に固有IDが発行される\n全ての投稿は公開設定で、全サーバーのユーザーが閲覧可能'
                },
                {
                    name: '📋 /feed - 投稿フィード表示',
                    value: '各種フィードを一覧表示するコマンドです。\n**選べる表示タイプ**\n🏠 ホーム（フォローしているユーザーの投稿）\n🖥️ サーバー内（現在のサーバーの投稿全て）\n🌐 グローバル（全サーバーの公開投稿）\n\n💡 一覧には各投稿のIDが表示されるので、他のコマンドでコピーして使用可能'
                },
                {
                    name: '❤️ /like - 投稿にいいね/取り消し',
                    value: '指定した投稿にいいねを追加・取り消すコマンドです。\n**必須オプション**\npostid：いいねする投稿のID\n\n**使い方**\n1. `/feed`などで投稿IDをコピー\n2. `/like postid:コピーしたID` を実行\n3. 同じIDで再度実行するといいねを取り消せる\n\n✅ トグル式なので、ボタン操作不要で簡単'
                },
                {
                    name: '💬 /reply - 投稿にリプライ',
                    value: '指定した投稿にコメントを送信するコマンドです。\n**必須オプション**\npostid：リプライする投稿のID\ncontent：リプライの本文\n\n**使い方**\n1. 投稿IDをコピーして `/reply postid:ID content:リプライ内容` で実行\n✅ 元の投稿者に通知が送信される'
                },
                {
                    name: '🔄 /repost - リポスト（引用RT）',
                    value: '他ユーザーの投稿を引用してリポストするコマンドです。\n**必須オプション**\npostid：リポストする元の投稿ID\ncontent：引用文（任意）\n\n**使い方**\n1. 元の投稿IDをコピー\n2. `/repost postid:ID content:引用したい文` で実行\n✅ 元の投稿のリポスト数が自動的に更新される'
                },
                {
                    name: '👥 /follow - ユーザーをフォロー/フォロー解除',
                    value: '指定したユーザーのフォロー・フォロー解除をトグルするコマンドです。\n**必須オプション**\nuser：フォローしたいユーザーをメンション\n\n**使い方**\n`/follow user:@ユーザー名` で実行するだけ\n✅ フォローすると、そのユーザーの投稿がホームフィードに表示される'
                },
                {
                    name: '👤 /profile - ユーザープロフィール表示',
                    value: '指定したユーザーのプロフィールと投稿一覧を表示するコマンドです。\n**必須オプション**\nuser：表示したいユーザーをメンション\n\n✅ フォロー数・フォロワー数・投稿一覧が確認できる'
                },
                {
                    name: '📈 /trends - トレンド表示',
                    value: '直近24時間でよく使われたハッシュタグをランキング表示するコマンドです。\n引数不要で `/trends` と実行するだけ\n✅ 人気のハッシュタグが上位10件まで表示される'
                },
                {
                    name: '🔍 /search - 検索機能',
                    value: 'ユーザー名・ハッシュタグで検索するコマンドです。\n**選べる検索タイプ**\nuser：ユーザー名で検索\nhashtag：ハッシュタグで検索\n**必須オプション**\nkeyword：検索キーワード'
                },
                {
                    name: '🗑️ /delete - 投稿・リポストの削除',
                    value: '自分の投稿・リポストを削除するコマンドです。\n**必須オプション**\npostid：削除したい投稿/リポストのID\n\n✅ リポストの取り消しもこのコマンドで可能\n⚠️ 他人の投稿は削除できません'
                },
                {
                    name: '👁️ /view - 各種コンテンツ閲覧',
                    value: '指定した投稿の各種一覧を閲覧するコマンドです。\n**必須オプション**\ntype：閲覧したいコンテンツの種類\n・replies：リプライ一覧\n・likes：いいねしたユーザー一覧\n・reposts：リポストしたユーザー一覧\nid：対象の投稿ID\n\n**使い方例**\n`/view type:replies id:投稿ID`\n`/view type:likes id:投稿ID`\n`/view type:reposts id:投稿ID`'
                },
                {
                    name: '📌 全操作をコマンドで完結',
                    value: '以前のボタン操作を廃止し、全てのアクションをスラッシュコマンドで行うように変更しました。\n投稿IDは必ず`/feed`などでコピーして、各コマンドのpostidオプションに貼り付けて使用してください。\n\n全てのIDは一意なので、他サーバーの投稿にも同じ方法で操作可能です！'
                }
            )
            .setTimestamp();
  
        await interaction.reply({ embeds: [helpEmbed], flags: 64 });
    }
};