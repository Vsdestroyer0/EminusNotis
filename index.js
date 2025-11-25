const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Alexa = require('ask-sdk-core');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Necesario para requests /skill
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -------- 1. Endpoint de autorización: muestra login web --------
app.get('/authorize', (req, res) => {
    const { client_id, redirect_uri, state } = req.query;
    res.render('login', { redirect_uri, state, client_id });
});

// -------- 2. Recibe credenciales hardcodeadas, valida y redirige con code --------
app.post('/auth', (req, res) => {
    const { username, password, redirect_uri, state } = req.body;
    if (username === "zs23014164" && password === "Vsdestroyer=185") {
        const fakeToken = "FAKE_ACCESS_TOKEN_EMINUS";
        const code = Buffer.from(`${username}:${fakeToken}`).toString('base64');
        res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
    } else {
        res.send('Login inválido. Revisa tu usuario y contraseña.');
    }
});

// -------- 3. Token exchange endpoint (Alexa POST aquí) --------
app.post('/token', bodyParser.urlencoded({ extended: false }), (req, res) => {
    const { code } = req.body;
    const decoded = Buffer.from(code, 'base64').toString();
    const [username, accessToken] = decoded.split(':');
    if (accessToken) {
        res.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 3600
        });
    } else {
        res.status(400).json({ error: 'invalid_grant' });
    }
});

// -------- 4. Skill handler (demo) --------

// Intent handler mock para Alexa
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        const token = handlerInput.requestEnvelope.context.System.user.accessToken;
        if (!token || token !== "FAKE_ACCESS_TOKEN_EMINUS") {
            return handlerInput.responseBuilder
                .speak("Primero debes vincular tu cuenta en la app de Alexa.")
                .withLinkAccountCard()
                .getResponse();
        }
        // Simulamos respuesta demo
        const speakOutput = "Tus tareas pendientes son: Actividad 1 para el 29 de noviembre, Actividad 2 para el 1 de diciembre.";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// Puedes agregar más handlers mock aquí...
const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        TareasPendientesIntentHandler
        // ... otros handlers como NotificacionesIntentHandler si los necesitas
    )
    .create();

app.post('/skill', (req, res) => {
    skill.invoke(req.body)
        .then((responseBody) => res.json(responseBody))
        .catch((err) => {
            console.error('Alexa Skill error:', err);
            res.status(500).send('Alexa Skill error');
        });
});

// -------- 5. Página principal --------
app.get('/', (req, res) => {
    res.send('Backend OAuth2 + Alexa Skill activo. DEMO hardcodeado.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OAuth2 + Alexa Skill DEMO corriendo en el puerto ${PORT}`);
});
