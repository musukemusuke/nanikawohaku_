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
client.feedInteractions = new Map(); // /feed コマンドの初期インタラクションを追跡するためのマップ
client.pageInteractions = new Map(); // /feed のページングインタラクションを追跡するためのマップ
client.postInteractions = new Map(); // /post の投稿確認インタラクションを追跡するためのマップ

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
            // 既存のテーブルにguild_nameカラムを追加（存在しない場合）
            db.run(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS guild_name TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding guild_name column:', err);
                } else {
                    console.log('guild_nameカラム追加完了');
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

            if (customId.startsWith('like_') || customId.startsWith('reply_')) {
                command = client.commands.get('feed');
                if (command && command.handleButton) {
                    try {
                        await command.handleButton(interaction);
                    } catch (error) {
                        console.error(error);
                        await interaction.reply({ content: 'ボタンの処理中にエラーが発生しました！', flags: 64 });
                    }
                }
            } else if (customId.startsWith('confirm_post_')) {
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
            } else if (customId.startsWith('prev_page_') || customId.startsWith('next_page_')) {
                // ページング用ボタンの処理
                command = client.commands.get('feed');
                if (command && command.handlePageButton) {
                    try {
                        await command.handlePageButton(interaction);
                    } catch (error) {
                        console.error(error);
                        await interaction.reply({ content: 'ページ移動の処理中にエラーが発生しました！', flags: 64 });
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

client.on('messageReactionAdd', async (reaction, user) => {
    // ボット自身のリアクションは無視
    if (user.bot) return;

    // リアクションが部分的な場合はフェッチ
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the reaction:', error);
            return;
        }
    }

    // client.postInteractions マップに登録されているメッセージに対するリアクションか確認
    const postOriginalInteraction = client.postInteractions.get(reaction.message.id);
    const feedOriginalInteraction = client.feedInteractions.get(reaction.message.id);
    const pageData = client.pageInteractions.get(reaction.message.id); // ページングデータの確認

    let originalInteraction = null;
    let commandName = null;

    if (postOriginalInteraction) {
        originalInteraction = postOriginalInteraction;
        commandName = 'post';
    } else if (feedOriginalInteraction) {
        originalInteraction = feedOriginalInteraction;
        commandName = 'feed';
    } else if (pageData) {
        // ページングメッセージへの不要なリアクションは削除
        if (user.id !== pageData.userId) {
            try {
                await reaction.users.remove(user.id);
            } catch (error) {
                console.error('Failed to remove reaction:', error);
            }
        }
        return;
    }

    if (originalInteraction) {
        // リアクションを付けたユーザーが、元のコマンドを実行したユーザーと同一か確認
        if (user.id !== originalInteraction.user.id) {
            // 異なるユーザーのリアクションは削除
            try {
                await reaction.users.remove(user.id);
            } catch (error) {
                console.error('Failed to remove reaction:', error);
            }
            return;
        }

        const command = client.commands.get(commandName);
        if (command && command.handleReaction) {
            try {
                await command.handleReaction(reaction, user, originalInteraction);
                // 処理後、ユーザーのリアクションを削除してクリーンに保つ
                try {
                    await reaction.users.remove(user.id);
                } catch (removeErr) {
                    if (removeErr.code !== 10008) { // Unknown Message以外のエラーのみログ出力
                        console.error('Error removing user reaction:', removeErr);
                    }
                }
            } catch (error) {
                if (error.code !== 10008) { // Unknown Message以外のエラーのみログ出力
                    console.error('Error handling reaction:', error);
                }
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);