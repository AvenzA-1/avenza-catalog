const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error("BOT_TOKEN or ADMIN_ID is missing");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Клиенты, которые открыли поддержку по конкретному товару.
// В памяти сервиса храним связь chatId -> productId.
const clientProducts = new Map();

// Кто сейчас ожидает ответ менеджера.
const waitingForReply = new Map();

const PRODUCTS = {
  p1:  { title: "Настольный фонтан", price: "140 000 сум" },
  p2:  { title: "Фонтан с чашами", price: "145 000 сум" },
  p3:  { title: "Настольная лампа", price: "105 000 сум" },
  p4:  { title: "Увлажнитель воздуха", price: "85 000 сум" },
  p5:  { title: "Настольный фонтан «Арка»", price: "140 000 сум" },
  p6:  { title: "Настольный фонтан «Золотые чаши»", price: "145 000 сум" },
  p7:  { title: "Настольный фонтан «Чайник»", price: "135 000 сум" },
  p8:  { title: "Настольный фонтан «Кран»", price: "135 000 сум" },
  p9:  { title: "Настольный фонтан с LED-подсветкой", price: "250 000 сум" },
  p10: { title: "Настольный фонтан для дома и офиса", price: "280 000 сум" },
  p11: { title: "Солнечный светильник с датчиком движения", price: "145 000 сум" },
  p12: { title: "Настенный светильник на солнечной батарее", price: "70 000 сум" },
  p13: { title: "Налобный LED фонарь", price: "65 000 сум" },
  p14: { title: "Мини-вентилятор с UV-подсветкой", price: "35 000 сум" },
  p15: { title: "Воскоплав для депиляции DELY 500 мл", price: "65 000 сум" },
  p16: { title: "Стайлер для волос IPARAH Professional", price: "885 000 сум" }
};

async function telegram(method, data = {}) {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  return response.json();
}

app.get("/", (req, res) => {
  res.send("AVENZA Support Bot is running!");
});

app.post("/telegram/webhook", async (req, res) => {
  try {
    const update = req.body;

    if (update.message) {
      await handleMessage(update.message);
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(200);
  }
});

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || "";

  // Сообщение от менеджера.
  if (chatId === ADMIN_ID) {
    const clientId = waitingForReply.get(ADMIN_ID);

    if (clientId && text) {
      await telegram("sendMessage", {
        chat_id: clientId,
        text: `👩‍💼 Менеджер AVENZA:\n\n${text}`
      });

      await telegram("sendMessage", {
        chat_id: ADMIN_ID,
        text: "✅ Ответ отправлен клиенту."
      });

      waitingForReply.delete(ADMIN_ID);
    }

    return;
  }

  // /start или /start p1
  if (text.startsWith("/start")) {
    const parts = text.trim().split(/\s+/);
    const payload = parts[1] || "";

    if (payload && PRODUCTS[payload]) {
      clientProducts.set(chatId, payload);
      const product = PRODUCTS[payload];

      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          `👋 Здравствуйте!\n\n` +
          `Вы хотите задать вопрос о товаре:\n` +
          `🛍 ${product.title}\n` +
          `💰 ${product.price}\n\n` +
          `Напишите свой вопрос, и менеджер AVENZA ответит вам здесь.`,
        reply_markup: {
          inline_keyboard: [[
            { text: "💬 Задать вопрос", callback_data: "question" }
          ]]
        }
      });
    } else {
      clientProducts.delete(chatId);

      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "👋 Здравствуйте!\n\n" +
          "Вы обратились в службу поддержки AVENZA.\n\n" +
          "Напишите свой вопрос — менеджер ответит вам здесь.",
        reply_markup: {
          inline_keyboard: [[
            { text: "💬 Задать вопрос", callback_data: "question" }
          ]]
        }
      });
    }

    return;
  }

  await sendClientQuestion(message);
}

async function sendClientQuestion(message) {
  const chatId = message.chat.id;

  const name =
    [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(" ") || "Не указано";

  const username = message.from?.username
    ? `@${message.from.username}`
    : "не указан";

  const text = message.text || "Сообщение без текста";

  const productId = clientProducts.get(chatId);
  const product = productId ? PRODUCTS[productId] : null;

  const productBlock = product
    ? `🛍 Товар: ${product.title}\n💰 Цена: ${product.price}\n\n`
    : "🛍 Товар: не указан\n\n";

  await telegram("sendMessage", {
    chat_id: ADMIN_ID,
    text:
      "🔔 НОВЫЙ ВОПРОС AVENZA\n\n" +
      productBlock +
      `👤 Клиент: ${name}\n` +
      `📱 Telegram: ${username}\n` +
      `🆔 ID: ${chatId}\n\n` +
      `💬 Вопрос:\n${text}`,
    reply_markup: {
      inline_keyboard: [[
        { text: "↩️ Ответить", callback_data: `answer:${chatId}` }
      ]]
    }
  });

  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      "✅ Ваш вопрос получен!\n\n" +
      "Менеджер AVENZA получил ваше сообщение и скоро ответит."
  });
}

async function handleCallback(callback) {
  const callbackChatId = callback.message.chat.id;
  const data = callback.data || "";

  if (callbackChatId !== ADMIN_ID) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id
    });
    return;
  }

  if (data.startsWith("answer:")) {
    const clientId = Number(data.split(":")[1]);

    waitingForReply.set(ADMIN_ID, clientId);

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id
    });

    await telegram("sendMessage", {
      chat_id: ADMIN_ID,
      text:
        "✍️ Напишите ответ клиенту следующим сообщением.\n\n" +
        "Ваше сообщение будет отправлено клиенту автоматически."
    });
  }

  if (data === "question") {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id
    });
  }
}

async function setupWebhook() {
  const externalUrl = process.env.RENDER_EXTERNAL_URL;

  if (!externalUrl) {
    console.log("RENDER_EXTERNAL_URL is not available yet.");
    return;
  }

  const webhookUrl = `${externalUrl}/telegram/webhook`;

  const result = await telegram("setWebhook", {
    url: webhookUrl
  });

  console.log("Webhook:", result);
}

app.listen(PORT, async () => {
  console.log(`AVENZA Support Bot running on port ${PORT}`);
  await setupWebhook();
});
