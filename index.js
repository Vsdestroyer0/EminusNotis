const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Alexa = require('ask-sdk-core');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// -------- 1. Endpoint de autorización simplificado (sin formulario) --------
app.get('/authorize', (req, res) => {
    // Credenciales hardcodeadas para pruebas
    const username = "zs23014164";
    const fakeToken = "FAKE_ACCESS_TOKEN_EMINUS";
    const { redirect_uri, state } = req.query;

    // Genera code y redirige directamente
    const code = Buffer.from(`${username}:${fakeToken}`).toString('base64');
    res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

// -------- 2. Página callback para OAuth --------
app.get('/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

// -------- 3. Página principal --------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------- 4. Token exchange endpoint (Alexa POST aquí) --------
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

// -------- 3. Alexa Skill Handlers --------

// Handler para LaunchRequest (al abrir la skill)
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = "Bienvenido a Tareas Eminus. Puedes pedirme tus tareas pendientes.";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Qué deseas hacer?")
            .getResponse();
    }
};

// Handler para IntentRequest de tareas pendientes
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        const token = handlerInput.requestEnvelope.context.System.user.accessToken;
        
        if (!token) {
            return handlerInput.responseBuilder
                .speak("Primero debes vincular tu cuenta de Eminus en la app de Alexa.")
                .withAskForPermissionsConsentCard(['alexa::profile:email'])
                .getResponse();
        }
        
        if (token !== "FAKE_ACCESS_TOKEN_EMINUS") {
            return handlerInput.responseBuilder
                .speak("El token de acceso no es válido. Por favor, vincula tu cuenta nuevamente.")
                .withLinkAccountCard()
                .getResponse();
        }
        
        try {
            // Aquí iría la lógica real para obtener tareas del API de Eminus
            // Por ahora simulamos una respuesta
            const tareas = [
                "Actividad 1 para el 29 de noviembre",
                "Actividad 2 para el 1 de diciembre", 
                "Examen final para el 5 de diciembre"
            ];
            
            const speakOutput = `Tienes ${tareas.length} tareas pendientes: ${tareas.join(', ')}.`;
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("¿Quieres conocer los detalles de alguna tarea específica?")
                .getResponse();
                
        } catch (error) {
            console.error('Error obteniendo tareas:', error);
            return handlerInput.responseBuilder
                .speak("Hubo un error al obtener tus tareas. Por favor, intenta nuevamente más tarde.")
                .getResponse();
        }
    }
};

// Handler de Fallback para debug
const FallbackHandler = {
    canHandle(handlerInput) { return true; },
    handle(handlerInput) {
        console.log("[DEBUG]: Request desconocida:", JSON.stringify(handlerInput.requestEnvelope, null, 2));
        return handlerInput.responseBuilder
            .speak("Request no reconocida por el demo.")
            .getResponse();
    }
};

// SkillBuilder con handlers
const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        TareasPendientesIntentHandler,
        FallbackHandler // SIEMPRE AL FINAL
    )
    .create();

// Endpoint de la skill que Alexa invoca
app.post('/skill', (req, res) => {
    console.log("[IN] Pedido Alexa:", JSON.stringify(req.body, null, 2));
    skill.invoke(req.body)
        .then((responseBody) => res.json(responseBody))
        .catch((err) => {
            console.error('Alexa Skill error:', err);
            res.status(500).send('Alexa Skill error');
        });
});

// -------- 5. Endpoint para verificar token (opcional) --------
app.post('/verify-token', (req, res) => {
    const { accessToken } = req.body;
    
    if (accessToken === "FAKE_ACCESS_TOKEN_EMINUS") {
        res.json({ 
            valid: true, 
            username: "zs23014164",
            message: "Token válido" 
        });
    } else {
        res.status(401).json({ 
            valid: false, 
            message: "Token inválido" 
        });
    }
});

// -------- 6. Página principal (mantenida por compatibilidad) --------
app.get('/demo', (req, res) => {
    res.send('Backend OAuth2 + Alexa Skill activo. DEMO hardcodeado.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OAuth2 + Alexa Skill DEMO corriendo en el puerto ${PORT}`);
});
