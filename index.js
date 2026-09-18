require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, REST, Routes, Partials } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions // リアクションイベントを有効にする
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] // 部分的なリアクションを処理するために必要
});

client.commands = new Collection();
client.postInteractions = new Map(); // /post コマンドの初期インタラクションを追跡するためのマップ




const sqlite3 = require('sqlite3').verbose();

// データベースの初期化と接続
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
            // テーブルが存在しない場合は作成
            db.run(`CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                author_id TEXT NOT NULL,
                author_username TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                guild_name TEXT,
                channel_id TEXT,
                message_id TEXT,
                content TEXT NOT NULL,
                image_url TEXT,
                is_private INTEGER NOT NULL,
                allowed_users TEXT,
                created_at TEXT NOT NULL,
                likes INTEGER DEFAULT 0
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS replies (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                author_username TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts(id)
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS user_likes (
                user_id TEXT NOT NULL,
                post_id TEXT NOT NULL,
                PRIMARY KEY (user_id, post_id),
                FOREIGN KEY (post_id) REFERENCES posts(id)
            )`);
            // フォロー機能用テーブル
            db.run(`CREATE TABLE IF NOT EXISTS user_follows (
                follower_id TEXT NOT NULL,
                followed_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, followed_id)
            )`);
            // ユーザー情報管理用テーブル（ユーザー名で検索可能にする）
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                discriminator TEXT,
                global_name TEXT,
                avatar_url TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            // 通知機能用テーブル
            db.run(`CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL, -- like, reply
                from_user_id TEXT NOT NULL,
                post_id TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES posts(id)
            )`);
            // ハッシュタグ機能用テーブル
            db.run(`CREATE TABLE IF NOT EXISTS post_hashtags (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                hashtag TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES posts(id)
            )`);
            // リポスト機能用テーブル
            db.run(`CREATE TABLE IF NOT EXISTS reposts (
                id TEXT PRIMARY KEY,
                original_post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                quote_text TEXT, -- 引用文（任意）
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (original_post_id) REFERENCES posts(id)
            )`);
            // 既存のテーブルにguild_nameカラムを追加（存在しない場合）
            db.run(`ALTER TABLE posts ADD COLUMN guild_name TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding guild_name column to posts:', err);
                }
            });
            // 既存のrepliesテーブルにguild_idカラムを追加（存在しない場合）
            db.run(`ALTER TABLE replies ADD COLUMN guild_id TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding guild_id column to replies:', err);
                } else {
                    console.log('guild_idカラム追加完了');
                }
            });
        });
    }
});

// データベースインスタンスをclientオブジェクトにアタッチ
client.db = db;

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// スラッシュコマンドの登録
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        const clientCommands = [];
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            clientCommands.push(command.data.toJSON());
        }

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: clientCommands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


client.once('clientReady', () => {
    console.log('Bot is online!');
    if (!process.env.CLIENT_ID) {
        console.warn('CLIENT_ID is not set in .env. Slash commands might not be registered correctly.');
    }
});

// paginationユーティリティをインポート
const { createPaginatedFeed } = require('./utils/pagination.js');

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'コマンドの実行中にエラーが発生しました！', flags: 64 });
            } else {
                await interaction.reply({ content: 'コマンドの実行中にエラーが発生しました！', flags: 64 });
            }
        }
    } else if (interaction.isButton()) {
            const customId = interaction.customId;
            let command;

            if (customId.startsWith('confirm_post_')) {
                // 投稿確認用のはい/いいえボタンの処理
                command = client.commands.get('post');
                if (command && command.handleButton) {
                    try {
                        await command.handleButton(interaction);
                    } catch (error) {
                        console.error(error);
                        await interaction.reply({ content: 'ボタンの処理中にエラーが発生しました！', flags: 64 });
                    }
                }
            }
    } else if (interaction.isModalSubmit()) {
        // モーダルのcustomIdからどのコマンドのモーダルかを判断し、そのコマンドのhandleModalSubmitを呼び出す
        let commandName = interaction.customId.split('_')[0]; // 例: 'post_modal_public' -> 'post'
        // delete_modalの場合は特別に'delete'を指定
        if (interaction.customId === 'delete_modal') {
            commandName = 'delete';
        }
        const command = client.commands.get(commandName);

        if (command && command.handleModalSubmit) {
            try {
                await command.handleModalSubmit(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'モーダルの処理中にエラーが発生しました！', flags: 64 });
            }
        }
    } else {
        return;
    }
});



client.login(process.env.DISCORD_TOKEN);