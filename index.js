const express = require('express');
const bodyParser = require('body-parser');
const Alexa = require('ask-sdk-core');
const axios = require('axios');

// ---------- INTENTS Y LÓGICA PRINCIPAL ---------- //

const getCursosVigentes = async (usuario, contraseña) => {
    const payload = {
        vigencia: 0,
        ordenado: 0,
        tipoUsuario: 0,
        idUsuarioMisFiltros: 0,
        visualizacion: 1
    };
    // Agrega la autenticación/cookies si el endpoint lo requiere (headers, etc)
    const response = await axios.post('https://eminus.uv.mx/eminusapi/api/Filtros/insFiltros', payload, {/*headers*/});
    return response.data; // lista de cursos vigentes
};

const getActividadesPendientes = async (idUsuario, idCurso) => {
    const response = await axios.get(`https://eminus.uv.mx/eminusapi8/api/Activity/getActividadEstudiante/${idUsuario}/${idCurso}`);
    const actividades = response.data.contenido;
    const ahora = new Date();
    return actividades.filter(a =>
        new Date(a.fechaEntrega) > ahora && a.visible === 1
    );
};

const getNotificaciones = async (idUsuario) => {
    const response = await axios.get(`https://eminus.uv.mx/eminusapi/api/Global/NotificacionesUsuario?idUsuario=${idUsuario}`);
    return response.data;
};

const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        // Simulación de credenciales de usuario. Para producción, obtén de una base de datos o user settings.
        const usuario = 'TU_USUARIO';
        const contraseña = 'TU_CONTRASEÑA';

        const cursos = await getCursosVigentes(usuario, contraseña);
        let speakOutput = "Tus tareas pendientes son: ";

        // Recorre los cursos y busca actividades pendientes
        for (let curso of cursos) {
            const actividades = await getActividadesPendientes(usuario, curso.idCurso);
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

const NotificacionesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'NotificacionesIntent';
    },
    async handle(handlerInput) {
        // Simulación de usuario. Obtén de settings o base de datos según implementación.
        const usuario = 'TU_USUARIO';

        const notificaciones = await getNotificaciones(usuario);

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

// ---------- EXPRESS APP PARA RENDER ---------- //
const app = express();
app.use(bodyParser.json());

// SkillBuilder como servicio HTTP (no exports.handler)
const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        TareasPendientesIntentHandler,
        NotificacionesIntentHandler,
        // más handlers si lo necesitas
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

// Puerto Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Alexa Skill backend corriendo en Render en el puerto', PORT);
});
