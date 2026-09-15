

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { initDatabase } = require('./database');
const handleButtonInteraction = require('./handlers/buttons');
const handleModalSubmit = require('./handlers/modals');

// 各コマンドをインポート
const postCommand = require('./commands/post');
const searchPostsCommand = require('./commands/search_posts');
const mypostsCommand = require('./commands/myposts');
const myrepliesCommand = require('./commands/myreplies');
const browsePostsCommand = require('./commands/browse_posts');
const helpCommand = require('./commands/help');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

// 全てのコマンドをコレクションに登録（各コマンドファイルで既にSlashCommandBuilderで定義済み）
const allCommands = [
  postCommand,
  searchPostsCommand,
  mypostsCommand,
  myrepliesCommand,
  browsePostsCommand,
  helpCommand
];

for (const command of allCommands) {
  client.commands.set(command.data.name, command);
}

// RESTで登録するためのコマンドデータを作成
const commands = allCommands.map(cmd => ({
  data: cmd.data,
  longDescription: cmd.longDescription,
  execute: cmd.execute
}));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('スラッシュコマンドを登録しています...');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(command => command.data.toJSON()) }
    );
    
    console.log('スラッシュコマンドの登録が完了しました');
  } catch (error) {
    console.error('コマンド登録中にエラーが発生しました:', error);
  }
}

client.on('interactionCreate', async interaction => {
  // モーダル送信の処理を外部ハンドラーに委譲
  if (interaction.isModalSubmit()) {
    return handleModalSubmit(interaction);
  }

  // ボタンクリックの処理を外部ハンドラーに委譲
  if (interaction.isButton()) {
    return handleButtonInteraction(interaction);
  }

  // スラッシュコマンドの処理
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, Array.from(client.commands.values()));
    } catch (error) {
      console.error('コマンド実行中にエラーが発生しました:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'コマンドの実行中にエラーが発生しました。', flags: 64 });
      } else {
        await interaction.followUp({ content: 'コマンドの実行中にエラーが発生しました。', flags: 64 });
      }
    }
  }
});

client.once('ready', async () => {
  console.log(`${client.user.tag} としてログインしました！`);
  
  // サーバー・ユーザー状況の出力
  const guilds = client.guilds.cache;
  let totalHumanUsers = 0;
  let totalBotUsers = 0;
  
  console.log('\n=== 現在のBot状況 ===');
  console.log(`参加サーバー数: ${guilds.size} サーバー`);
  
  
  console.log('\n--- 参加サーバー一覧 ---');
  
  let i = 1;
  for (const guild of guilds.values()) {
    try {
      await guild.members.fetch(); // 全メンバーをキャッシュに読み込む
      const allMembers = guild.members.cache;
      const humanMembers = allMembers.filter(member => !member.user.bot);
      const botMembers = allMembers.filter(member => member.user.bot);
      
      totalHumanUsers += humanMembers.size;
      totalBotUsers += botMembers.size;
      
      console.log(`${i}. ${guild.name} (ID: ${guild.id}) - メンバー数: ${guild.memberCount}`);
      if (humanMembers.size > 0) {
        console.log(`   人間メンバー: ${humanMembers.map(m => m.user.username).join(', ')}`);
      } else {
        console.log("   人間メンバー: いません");
      }
      if (botMembers.size > 0) {
        console.log(`   Botメンバー: ${botMembers.map(m => m.user.username).join(', ')}`);
      } else {
        console.log("   Botメンバー: いません");
      }
      console.log("");
    } catch (error) {
      console.error(`サーバー ${guild.name} (ID: ${guild.id}) のメンバー取得中にエラーが発生しました:`, error);
    } finally {
      i++;
    }
  }
  
  console.log(`総人間ユーザー数: ${totalHumanUsers}人`);
  console.log(`総Botユーザー数: ${totalBotUsers}人`);
  console.log('======================\n');
  
  // アクティビティ（ステータス）を設定
  client.user.setActivity({ name: "/help", type: 0 }); // 0 = PLAYING
  
  await initDatabase();
  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);