// index.js
const Alexa = require('ask-sdk-core');
const axios = require('axios');

const getCursosVigentes = async (usuario, contraseña) => {
    const payload = {
        vigencia: 0, ordenado: 0, tipoUsuario: 0, idUsuarioMisFiltros: 0, visualizacion: 1
    };
    // Aquí va la autenticación si es necesaria: cookies, headers, etc. (dependiendo de cómo sea en Eminus)
    const response = await axios.post('https://eminus.uv.mx/eminusapi/api/Filtros/insFiltros', payload, {/*headers con auth*/});
    return response.data; // lista de cursos vigentes
};

const getActividadesPendientes = async (idUsuario, idCurso) => {
    const response = await axios.get(`https://eminus.uv.mx/eminusapi8/api/Activity/getActividadEstudiante/${idUsuario}/${idCurso}`);
    const actividades = response.data.contenido;
    const ahora = new Date();
    // Filtrar tareas pendientes --> fecha no vencida y visible
    return actividades.filter(a =>
        new Date(a.fechaEntrega) > ahora && a.visible === 1
    );
};

const getNotificaciones = async (idUsuario) => {
    const response = await axios.get(`https://eminus.uv.mx/eminusapi/api/Global/NotificacionesUsuario?idUsuario=${idUsuario}`);
    return response.data;
};

// Intent principal: pedir tareas pendientes
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        // Recuperar datos del usuario configurados por la app o base de datos
        const { usuario, contraseña } = await handlerInput.attributesManager.getPersistentAttributes();
        const cursos = await getCursosVigentes(usuario, contraseña);

        let speakOutput = "Tus tareas pendientes son: ";
        for (let curso of cursos) {
            const actividades = await getActividadesPendientes(usuario, curso.idCurso);
            if (actividades.length > 0) {
                speakOutput += `En el curso ${curso.nombre} tienes: `;
                actividades.forEach(act => {
                    speakOutput += `${act.titulo}, para el ${act.fechaEntrega}. `;
                });
            }
        }
        if (speakOutput === "Tus tareas pendientes son: ") speakOutput = "No tienes tareas pendientes en tus cursos vigentes.";
        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    }
};

// Intent: pedir notificaciones
const NotificacionesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NotificacionesIntent';
    },
    async handle(handlerInput) {
        const { usuario } = await handlerInput.attributesManager.getPersistentAttributes();
        const notificaciones = await getNotificaciones(usuario);

        let speakOutput = "Resumen de novedades: ";
        // Ejemplo para actividades/examenes
        if (notificaciones.actNuevas > 0)
            speakOutput += `Tienes ${notificaciones.actNuevas} actividades nuevas. `;
        if (notificaciones.exNuevos > 0)
            speakOutput += `Tienes ${notificaciones.exNuevos} exámenes nuevos. `;
        // Repite para otros campos según lo que devuelva el endpoint

        if (speakOutput === "Resumen de novedades: ") speakOutput = "No tienes novedades nuevas en este momento.";
        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    }
};

// Otras funciones e intents necesarios...

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        TareasPendientesIntentHandler,
        NotificacionesIntentHandler,
        // otros handlers...
    )
    .lambda();
