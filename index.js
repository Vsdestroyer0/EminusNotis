const express = require('express');
const bodyParser = require('body-parser');
const Alexa = require('ask-sdk-core');
const axios = require('axios');

// --------- INTENTS Y LÓGICA PRINCIPAL --------- //

const autenticarEminus = async (usuario, contraseña) => {
    const payload = { username: usuario, password: contraseña };
    const response = await axios.post('https://eminus.uv.mx/eminusapi/api/auth', payload);
    // Devuelve el accessToken y otros datos útiles
    return response.data;
};

const getCursosVigentes = async (token) => {
    const payload = {
        vigencia: 0,
        ordenado: 0,
        tipoUsuario: 0,
        idUsuarioMisFiltros: 0,
        visualizacion: 1
    };
    const response = await axios.post(
        'https://eminus.uv.mx/eminusapi/api/Filtros/insFiltros', 
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

const getActividadesPendientes = async (token, idUsuario, idCurso) => {
    const response = await axios.get(
        `https://eminus.uv.mx/eminusapi8/api/Activity/getActividadEstudiante/${idUsuario}/${idCurso}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const actividades = response.data.contenido;
    const ahora = new Date();
    return actividades.filter(a =>
        new Date(a.fechaEntrega) > ahora && a.visible === 1
    );
};

const getNotificaciones = async (token, idUsuario) => {
    const response = await axios.get(
        `https://eminus.uv.mx/eminusapi/api/Global/NotificacionesUsuario?idUsuario=${idUsuario}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

// --------- HANDLER PARA GUARDAR USUARIO Y CONTRASEÑA --------- //
const ConfigurarUsuarioIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConfigurarUsuarioIntent';
    },
    async handle(handlerInput) {
        const usuario = Alexa.getSlotValue(handlerInput.requestEnvelope, 'usuario');
        const contraseña = Alexa.getSlotValue(handlerInput.requestEnvelope, 'contraseña');
        await handlerInput.attributesManager.setPersistentAttributes({ usuario, contraseña });
        await handlerInput.attributesManager.savePersistentAttributes();
        return handlerInput.responseBuilder
            .speak(`Tus datos han sido guardados, ${usuario}.`)
            .getResponse();
    }
};

// --------- HANDLER TAREAS PENDIENTES --------- //
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        const atributos = await handlerInput.attributesManager.getPersistentAttributes();
        const usuario = atributos.usuario;
        const contraseña = atributos.contraseña;

        if (!usuario || !contraseña) {
            return handlerInput.responseBuilder
                .speak("Primero debes configurar tu usuario y contraseña. Di 'Mi usuario es ... y mi contraseña es ...'")
                .getResponse();
        }

        const auth = await autenticarEminus(usuario, contraseña);
        const token = auth.accessToken;

        const cursos = await getCursosVigentes(token);
        let speakOutput = "Tus tareas pendientes son: ";

        for (let curso of cursos) {
            const actividades = await getActividadesPendientes(token, usuario, curso.idCurso);
            if (actividades.length > 0) {
                speakOutput += `En el curso ${curso.nombre} tienes: `;
                actividades.forEach(act => {
                    speakOutput += `${act.titulo}, para el ${act.fechaEntrega}. `;
                });
            }
        }
        if (speakOutput === "Tus tareas pendientes son: ") {
            speakOutput = "No tienes tareas pendientes en tus cursos vigentes.";
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// --------- HANDLER NOTIFICACIONES --------- //
const NotificacionesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'NotificacionesIntent';
    },
    async handle(handlerInput) {
        const atributos = await handlerInput.attributesManager.getPersistentAttributes();
        const usuario = atributos.usuario;
        const contraseña = atributos.contraseña;

        if (!usuario || !contraseña) {
            return handlerInput.responseBuilder
                .speak("Primero debes configurar tu usuario y contraseña. Di 'Mi usuario es ... y mi contraseña es ...'")
                .getResponse();
        }

        const auth = await autenticarEminus(usuario, contraseña);
        const token = auth.accessToken;

        const notificaciones = await getNotificaciones(token, usuario);

        let speakOutput = "Resumen de novedades: ";
        if (notificaciones.actNuevas > 0)
            speakOutput += `Tienes ${notificaciones.actNuevas} actividades nuevas. `;
        if (notificaciones.exNuevos > 0)
            speakOutput += `Tienes ${notificaciones.exNuevos} exámenes nuevos. `;
        if (speakOutput === "Resumen de novedades: ")
            speakOutput = "No tienes novedades nuevas en este momento.";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// --------- EXPRESS APP PARA RENDER --------- //
const app = express();
app.use(bodyParser.json());

const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        ConfigurarUsuarioIntentHandler,
        TareasPendientesIntentHandler,
        NotificacionesIntentHandler
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Alexa Skill backend corriendo en Render en el puerto', PORT);
});
