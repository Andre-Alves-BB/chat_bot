const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Dalmazo Online!'));
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        // CAMINHO OBRIGATÓRIO PARA O CHROME NO RAILWAY
        executablePath: '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

let fasesPedido = {};

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Dalmazo\'s Bot está online! 🚀'));

client.on('message', async msg => {
    try {
        const userMessage = msg.body.toLowerCase().trim();
        const userId = msg.from;
        const options = { sendSeen: false };

        // --- LÓGICA DE HORÁRIO ---
        const agora = new Date();
        const diaSemana = agora.getDay(); // 0=Dom, 1=Seg...
        const hora = agora.getHours();
        const minuto = agora.getMinutes();

        const totalMinutosAgora = (hora * 60) + minuto;
        const totalMinutosAbertura = (18 * 60); // 18:30
        const totalMinutosFechamento = (23 * 60);  // 23:00

        const estaNoHorario = (totalMinutosAgora >= totalMinutosAbertura && totalMinutosAgora <= totalMinutosFechamento);
        const ehDiaUtil = (diaSemana !== 1); // Loja fecha na Segunda
        const lojaAberta = estaNoHorario && ehDiaUtil;

        console.log(`[LOG] Hora: ${hora}:${minuto} | Dia: ${diaSemana} | Aberta: ${lojaAberta}`);

        // 1. FILTRO DE HORÁRIO (SAUDAÇÃO OU TENTATIVA DE PEDIDO)
        if (!lojaAberta) {
            const tentarPedir = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', '1'].some(s => userMessage.includes(s)) ||
                (userMessage.includes('pedido') && userMessage.includes('dalmazo'));

            if (tentarPedir) {
                await client.sendMessage(userId,
                    `*Poxa, no momento estamos fechados!* 🌙\n\n` +
                    `Nosso horário de atendimento é de *Terça a Domingo*, das *18:30 às 23:00*.\n\n` +
                    `Aguardamos você mais tarde! 🌭🍔*.\n\n`,
                    options
                );
                return;
            }
        }

        // 2. SAUDAÇÃO (APENAS SE ABERTO)
        if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].some(s => userMessage.includes(s))) {
            delete fasesPedido[userId];
            await client.sendMessage(userId,
                `Olá! Bem-vindo ao *Dogão Burger Dalmazo's*! 🌭🍔\n\n` +
                `Como posso te ajudar hoje?\n\n` +
                `1️⃣ - Fazer Pedido (Cardápio)\n` +
                `2️⃣ - Horário de Funcionamento\n`,
                options
            );
            return;
        }

        // 3. OPÇÃO 1 - CARDÁPIO
        if (userMessage === '1') {
            await client.sendMessage(userId,
                `Ótima escolha! Monte seu pedido no nosso site:\n` +
                `👉 *https://burgerdalmazo.netlify.app* \n\n` +
                `*(Após escolher, clique no botão de enviar para confirmar seu pedido aqui)*`,
                options
            );
            return;
        }

        // 4. RECEBIMENTO DO PEDIDO DO SITE
        if (userMessage.includes('pedido') && userMessage.includes('dalmazo')) {
            fasesPedido[userId] = {
                passo: 'nome',
                detalhesLanche: msg.body
            };
            await client.sendMessage(userId, `Opa! Recebi seu pedido aqui. 😍\n\nPara começar, qual o seu *Nome*?`, options);
            return;
        }

        // 5. MÁQUINA DE ESTADOS (PASSO A PASSO)
        if (fasesPedido[userId]) {
            let etapa = fasesPedido[userId];

            // Coleta Nome
            if (etapa.passo === 'nome') {
                etapa.nome = msg.body;
                etapa.passo = 'endereco';
                await client.sendMessage(userId, `Prazer, *${etapa.nome}*! Agora, qual o seu *Endereço completo*? (Rua, nº e Bairro)`, options);
                return;
            }

            // Coleta Endereço
            if (etapa.passo === 'endereco') {
                etapa.endereco = msg.body;
                etapa.passo = 'pagamento';
                await client.sendMessage(userId,
                    `Perfeito! Como deseja pagar?\n\n` +
                    `1️⃣ - Pix\n` +
                    `2️⃣ - Cartão (Maquininha)\n` +
                    `3️⃣ - Dinheiro`,
                    options
                );
                return;
            }

            // Coleta Pagamento
            if (etapa.passo === 'pagamento') {
                if (userMessage === '1') etapa.pagamento = 'Pix';
                else if (userMessage === '2') etapa.pagamento = 'Cartão';
                else if (userMessage === '3') etapa.pagamento = 'Dinheiro';
                else {
                    await client.sendMessage(userId, `❌ Opção inválida. Digite apenas o número:\n1 (Pix), 2 (Cartão) ou 3 (Dinheiro)`, options);
                    return;
                }

                etapa.passo = 'confirmacao';
                let resumo = `*RESUMO DO SEU PEDIDO* 📝\n\n`;
                resumo += `${etapa.detalhesLanche}\n\n`;
                resumo += `👤 *Cliente:* ${etapa.nome}\n`;
                resumo += `📍 *Endereço:* ${etapa.endereco}\n`;
                resumo += `💳 *Pagamento:* ${etapa.pagamento}\n\n`;
                resumo += `Está tudo certinho? Digite *OK* para confirmar!`;

                await client.sendMessage(userId, resumo, options);
                return;
            }

            // Confirmação e Preparo
            if (etapa.passo === 'confirmacao' && userMessage === 'ok') {
                await client.sendMessage(userId, `*PEDIDO CONFIRMADO!* 🛒✅`, options);

                setTimeout(async () => {
                    await client.sendMessage(userId,
                        `Seu lanche já está em preparo com muito carinho! 👨‍🍳🔥\n\n` +
                        `🛵 O prazo de entrega é de aproximadamente *30 minutos*.\n\n` +
                        `Prepare o coração, porque o melhor lanche da região está a caminho! Obrigado pela preferência! 😋❤️`,
                        options
                    );
                }, 5000);

                delete fasesPedido[userId];
                return;
            }
        }

        // 6. RESPOSTAS FIXAS
        if (userMessage === '2') {
            await client.sendMessage(userId, `🕒 Atendemos de Terça a Domingo, das 18:30 às 23:00!`, options);
        }


    } catch (error) {
        console.error('Erro no processamento:', error);
    }
});

client.initialize();