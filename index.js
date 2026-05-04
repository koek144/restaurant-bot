const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURACIÓN - Green API
// ============================================
const GREEN_API_CONFIG = {
  idInstance: '7107609061',
  apiToken: '82397ed3150843ceb31b389eb75dfa8f1bf536ee0a874fd781',
  apiUrl: 'https://7107.api.greenapi.com'
};

// ============================================
// MENSAJE DE BIENVENIDA
// ============================================
const MENSAJE_BIENVENIDA = `🍽️ ¡Hola! Soy el asistente de reservas de mesas.

¿En qué puedo ayudarte hoy?

*1.* 📅 Reservar mesa
*2.* 📖 Ver carta
*3.* ⭐ Sugerencias del día

Escribe el número de la opción que desees.`;

// ============================================
// DATOS DEL RESTAURANTE
// ============================================
let restaurantData = {
  mesas: [
    { id: '1', numero: 1, ubicacion: 'interior', capacidad: 4, activa: true },
    { id: '2', numero: 2, ubicacion: 'interior', capacidad: 4, activa: true },
    { id: '3', numero: 3, ubicacion: 'interior', capacidad: 6, activa: true },
    { id: '4', numero: 4, ubicacion: 'exterior', capacidad: 4, activa: true },
    { id: '5', numero: 5, ubicacion: 'exterior', capacidad: 6, activa: true },
    { id: '6', numero: 6, ubicacion: 'exterior', capacidad: 8, activa: true },
    { id: '7', numero: 7, ubicacion: 'alta', capacidad: 2, activa: true },
    { id: '8', numero: 8, ubicacion: 'alta', capacidad: 4, activa: true },
  ],
  carta: [
    { id: '1', nombre: 'Ensalada César', precio: 8.50, categoria: 'entrantes' },
    { id: '2', nombre: 'Carpaccio', precio: 12.00, categoria: 'entrantes' },
    { id: '3', nombre: 'Paella mixta', precio: 18.00, categoria: 'principales' },
    { id: '4', nombre: 'Solomillo', precio: 24.00, categoria: 'principales' },
  ],
  reservas: []
};

// Estados del flujo de conversación
const conversationStates = new Map();

// ============================================
// FUNCIONES DE MENSAJERÍA WHATSAPP
// ============================================

async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const response = await fetch(`${GREEN_API_CONFIG.apiUrl}/waInstance${GREEN_API_CONFIG.idInstance}/sendMessage/${GREEN_API_CONFIG.apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${phoneNumber}@c.us`,
        message: message
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    throw error;
  }
}

function generateMenu() {
  return `🍽️ *Bienvenido al Restaurante*

Selecciona una opción:

*1.* 📅 Reservar mesa
*2.* 📖 Ver carta
*3.* ⭐ Sugerencias del día

Escribe el número de la opción que desees.`;
}

function getCarta() {
  let cartaText = `📖 *Nuestra Carta*\n\n`;

  const categorias = {
    entrantes: '🥗 Entrantes',
    principales: '🍖 Principales',
    postres: '🍰 Postres',
    bebidas: '🥤 Bebidas'
  };

  for (const [cat, titulo] of Object.entries(categorias)) {
    cartaText += `\n*${titulo}*\n`;
    restaurantData.carta
      .filter(p => p.categoria === cat)
      .forEach(p => {
        cartaText += `• ${p.nombre}: €${p.precio.toFixed(2)}\n`;
      });
  }

  return cartaText;
}

function getSugerencias() {
  let text = `⭐ *Sugerencias del Día*\n\n`;
  text += `• Paella especial: €15.00 (ahorro 20%)\n`;
  text += `• Solomillo del chef: €20.00 (ahorro 15%)\n\n`;
  text += `¡Pregunta al camarero!`;
  return text;
}

// ============================================
// LÓGICA DE RESERVAS
// ============================================

function getAvailableTables(fecha, hora, ubicacion, personas) {
  const disponibles = restaurantData.mesas.filter(m =>
    m.activa &&
    m.ubicacion === ubicacion &&
    m.capacidad >= personas
  );
  return disponibles;
}

function findAlternativeTables(fecha, hora, personas, ubicacionPreferida) {
  const alternativas = [];

  const preferidas = getAvailableTables(fecha, hora, ubicacionPreferida, personas);
  if (preferidas.length > 0) {
    alternativas.push(...preferidas);
  }

  if (alternativas.length === 0) {
    const otras = ['interior', 'exterior', 'alta'].filter(u => u !== ubicacionPreferida);
    for (const ub of otras) {
      const disponibles = getAvailableTables(fecha, hora, ub, personas);
      if (disponibles.length > 0) {
        alternativas.push(...disponibles.map(m => ({ ...m, sugerencia: `Te recomendamos ${ub}` })));
        break;
      }
    }
  }

  if (alternativas.length === 0 && personas >= 6) {
    const combinables = restaurantData.mesas.filter(m =>
      m.activa &&
      m.ubicacion === ubicacionPreferida &&
      m.capacidad >= Math.ceil(personas / 2)
    );

    for (let i = 0; i < combinables.length; i++) {
      for (let j = i + 1; j < combinables.length; j++) {
        if (combinables[i].capacidad + combinables[j].capacidad >= personas) {
          alternativas.push({
            ...combinables[i],
            combinacion: [combinables[i], combinables[j]],
            mensaje: `Podemos combinar la mesa ${combinables[i].numero} y ${combinables[j].numero} para ${personas} personas`
          });
        }
      }
    }
  }

  return alternativas;
}

async function handleReservationFlow(phone, message, state) {
  const userInput = message.trim().toLowerCase();

  switch (state.step) {
    case 'menu':
      if (userInput === '1') {
        return {
          nextStep: 'fecha',
          response: `📅 *Reserva de mesa*

Indica la *fecha* de la reserva:
📆 Formato: DD/MM/AAAA
Ejemplo: 15/05/2024

O escribe "hoy" o "mañana"`,
          state: { ...state, step: 'fecha' }
        };
      } else if (userInput === '2') {
        return { response: getCarta(), state };
      } else if (userInput === '3') {
        return { response: getSugerencias(), state };
      } else if (userInput === 'menu' || userInput === 'inicio') {
        return { response: generateMenu(), state };
      } else {
        // Si escribe cualquier cosa en el menú, dar la bienvenida
        return { response: generateMenu(), state };
      }

    case 'fecha':
      let fecha;
      if (userInput === 'hoy') {
        fecha = new Date().toISOString().split('T')[0];
      } else if (userInput === 'mañana') {
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        fecha = manana.toISOString().split('T')[0];
      } else {
        const parts = userInput.split('/');
        if (parts.length === 3) {
          fecha = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
          return { response: 'Formato de fecha incorrecto. Usa DD/MM/AAAA', state };
        }
      }

      return {
        response: `📅 Reserva para el ${new Date(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}

⏰ Ahora indica la *hora* de la reserva:
🕐 Formato: HH:MM
Ejemplo: 20:30`,
        state: { ...state, step: 'hora', fecha }
      };

    case 'hora':
      const horaRegex = /^(\d{1,2}):(\d{2})$/;
      const match = userInput.match(horaRegex);
      if (!match) {
        return { response: 'Formato de hora incorrecto. Usa HH:MM (ej: 20:30)', state };
      }

      const hora = `${match[1].padStart(2, '0')}:${match[2]}`;

      return {
        response: `⏰ Hora: ${hora}

🏠 Indica la *ubicación* preferida:
*1.* Interior 🍃
*2.* Exterior ☀️
*3.* Barra Alta 🍸`,
        state: { ...state, step: 'ubicacion', hora }
      };

    case 'ubicacion':
      const ubicMap = { '1': 'interior', '2': 'exterior', '3': 'alta' };
      const ubicacion = ubicMap[userInput];
      if (!ubicacion) {
        return { response: 'Indica 1, 2 o 3 para la ubicación', state };
      }

      return {
        response: `🏠 Ubicación: ${ubicacion}

👥 Indica el *número de personas* (del 1 al 20)`,
        state: { ...state, step: 'personas', ubicacion }
      };

    case 'personas':
      const personas = parseInt(userInput);
      if (isNaN(personas) || personas < 1 || personas > 20) {
        return { response: 'Indica un número del 1 al 20', state };
      }

      const disponibles = findAlternativeTables(state.fecha, state.hora, personas, state.ubicacion);

      if (disponibles.length === 0) {
        const otrasUbicaciones = ['interior', 'exterior', 'alta'].filter(u => u !== state.ubicacion);
        let alternativa = null;

        for (const ub of otrasUbicaciones) {
          const disp = getAvailableTables(state.fecha, state.hora, ub, personas);
          if (disp.length > 0) {
            alternativa = { ubicacion: ub, mesas: disp };
            break;
          }
        }

        if (alternativa) {
          return {
            response: `❌ Lo sentimos, no hay mesas ${state.ubicacion} disponibles para ${personas} personas.

✅ *Alternativa:* Tenemos ${alternativa.mesas.length} mesa(s) ${alternativa.ubicacion} disponibles.

*1.* Aceptar alternativa
*2.* Cambiar fecha
*3.* Cambiar hora
*4.* Volver al menú`,
            state: { ...state, step: 'alternativa', alternativa }
          };
        }

        return {
          response: `❌ Lo sentimos, no hay disponibilidad para ${personas} personas.

*1.* Cambiar fecha
*2.* Cambiar hora
*3.* Volver al menú`,
          state: { ...state, step: 'cambiar' }
        };
      }

      let msg = `✅ *Mesas disponibles* para ${personas} personas:\n\n`;
      disponibles.slice(0, 5).forEach((mesa, i) => {
        if (mesa.combinacion) {
          msg += `*${i + 1}.* ${mesa.mensaje}\n`;
        } else {
          msg += `*${i + 1}.* Mesa ${mesa.numero} (${mesa.ubicacion}) - ${mesa.capacidad} pers.\n`;
        }
      });
      msg += `\nEscribe el número para seleccionar:`;

      return {
        response: msg,
        state: { ...state, step: 'seleccionar_mesa', disponibles, personas }
      };

    case 'seleccionar_mesa':
      const idx = parseInt(userInput) - 1;
      if (isNaN(idx) || idx < 0 || idx >= state.disponibles.length) {
        return { response: 'Indica un número de la lista', state };
      }

      const mesaSeleccionada = state.disponibles[idx];
      const mesaIds = mesaSeleccionada.combinacion
        ? mesaSeleccionada.combinacion.map(m => m.id)
        : [mesaSeleccionada.id];

      return {
        response: `✅ Mesa ${mesaSeleccionada.numero} seleccionada

📝 Ahora necesitamos tus datos:

*1.* Nombre`,
        state: { ...state, step: 'nombre', mesaSeleccionada, mesaIds }
      };

    case 'nombre':
      return {
        response: `👤 Apellidos`,
        state: { ...state, step: 'apellidos', nombre: message }
      };

    case 'apellidos':
      return {
        response: `📞 Teléfono de contacto`,
        state: { ...state, step: 'telefono', apellidos: message }
      };

    case 'telefono':
      return {
        response: `✉️ Email (opcional)`,
        state: { ...state, step: 'email', telefono: message }
      };

    case 'email':
      const reserva = {
        id: crypto.randomUUID(),
        fecha: state.fecha,
        hora: state.hora,
        nombre: state.nombre,
        apellidos: state.apellidos,
        telefono: state.telefono,
        email: message || 'no proporcionado',
        personas: state.personas,
        mesaIds: state.mesaIds,
        ubicacion: state.ubicacion,
        estado: 'pendiente',
        createdAt: new Date().toISOString()
      };

      restaurantData.reservas.push(reserva);

      const confirmMsg = `🎉 *¡Reserva confirmada!*

📅 Fecha: ${new Date(state.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
⏰ Hora: ${state.hora}
👥 Personas: ${state.personas}
🏠 Ubicación: ${state.ubicacion}
🪑 Mesa: ${state.mesaSeleccionada.numero}

👤 Cliente: ${state.nombre} ${state.apellidos}

Te esperamos. ¡Buen provecho! 🍽️`;

      console.log('Nueva reserva creada:', JSON.stringify(reserva, null, 2));

      return {
        response: confirmMsg,
        state: { step: 'menu' }
      };

    case 'alternativa':
      if (userInput === '1') {
        return {
          response: `📝 Tus datos para confirmar:

*1.* Nombre`,
          state: { ...state, step: 'nombre', ubicacion: state.alternativa.ubicacion, mesaSeleccionada: state.alternativa.mesas[0] }
        };
      } else if (userInput === '2') {
        return { response: 'Indica la nueva fecha (DD/MM/AAAA)', state: { ...state, step: 'fecha' } };
      } else if (userInput === '3') {
        return { response: 'Indica la nueva hora (HH:MM)', state: { ...state, step: 'hora' } };
      } else {
        return { response: generateMenu(), state: { step: 'menu' } };
      }

    case 'cambiar':
      if (userInput === '1') {
        return { response: 'Indica la nueva fecha (DD/MM/AAAA)', state: { ...state, step: 'fecha' } };
      } else if (userInput === '2') {
        return { response: 'Indica la nueva hora (HH:MM)', state: { ...state, step: 'hora' } };
      } else {
        return { response: generateMenu(), state: { step: 'menu' } };
      }

    default:
      return { response: generateMenu(), state: { step: 'menu' } };
  }
}

// ============================================
// WEBHOOK PARA RECIBIR MENSAJES
// ============================================

app.post('/webhook/green-api', async (req, res) => {
  try {
    const body = req.body;
    console.log('Payload recibido:', JSON.stringify(body, null, 2));

    // Extraer datos del mensaje según el tipo de notificación
    let phone = '';
    let text = '';

    if (body.typeWebhook === 'incomingMessageReceived') {
      const messageData = body.messageData;
      phone = messageData.key.remoteJid.replace('@c.us', '');
      text = messageData.message?.conversation ||
             messageData.message?.extendedTextMessage?.text || '';
    } else if (body.typeWebhook === 'outgoingMessageReceived') {
      // Ignorar mensajes salientes
      res.json({ success: true, ignored: true });
      return;
    } else {
      // Otro tipo de webhook, ignorar
      console.log('Tipo de webhook no manejado:', body.typeWebhook);
      res.json({ success: true, ignored: true });
      return;
    }

    if (!phone || !text) {
      console.log('Mensaje sin datos útiles, ignorando');
      res.json({ success: true, noData: true });
      return;
    }

    console.log(`Mensaje de ${phone}: ${text}`);

    let state = conversationStates.get(phone) || { step: 'menu' };
    let response;

    // Si el usuario escribe algo, procesar
    if (text.trim()) {
      response = await handleReservationFlow(phone, text, state);
    } else {
      response = { response: generateMenu(), state: { step: 'menu' } };
    }

    conversationStates.set(phone, response.state);

    // Enviar respuesta
    await sendWhatsAppMessage(phone, response.response);

    res.json({ success: true, responseSent: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Endpoint simple para recibir notificaciones (formato alternativo)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('Webhook /webhook recibido:', JSON.stringify(body, null, 2));

    let phone = '';
    let text = '';

    // Intentar diferentes formatos
    if (body.phone) {
      phone = body.phone.toString().replace(/[^0-9]/g, '');
    }
    if (body.text || body.message) {
      text = body.text || body.message;
    }

    // Si hay mensaje y teléfono, procesar
    if (phone && text) {
      console.log(`Procesando mensaje de ${phone}: ${text}`);

      let state = conversationStates.get(phone) || { step: 'menu' };
      let response = await handleReservationFlow(phone, text, state);

      conversationStates.set(phone, response.state);
      await sendWhatsAppMessage(phone, response.response);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ============================================
// API PARA EL BACKOFFICE
// ============================================

app.get('/api/reservas', (req, res) => {
  res.json(restaurantData.reservas);
});

app.post('/api/reservas', (req, res) => {
  const reserva = {
    ...req.body,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  restaurantData.reservas.push(reserva);
  res.json(reserva);
});

app.put('/api/reservas/:id', (req, res) => {
  const idx = restaurantData.reservas.findIndex(r => r.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }
  restaurantData.reservas[idx] = { ...restaurantData.reservas[idx], ...req.body };
  res.json(restaurantData.reservas[idx]);
});

app.post('/api/reservas/:id/notificar', async (req, res) => {
  const reserva = restaurantData.reservas.find(r => r.id === req.params.id);
  if (!reserva) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }

  const mensaje = req.body.mensaje || `Tu reserva ha sido modificada.\n\nFecha: ${reserva.fecha}\nHora: ${reserva.hora}\nPersonas: ${reserva.personas}`;

  try {
    await sendWhatsAppMessage(reserva.telefono, mensaje);
    res.json({ success: true, message: 'Notificación enviada' });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando notificación' });
  }
});

app.get('/api/carta', (req, res) => {
  res.json(restaurantData.carta);
});

app.get('/api/status', (req, res) => {
  res.json({
    configured: GREEN_API_CONFIG.idInstance !== 'TU_ID_INSTANCE',
    message: 'Green API configurada',
    instance: GREEN_API_CONFIG.idInstance
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🍽️  SERVIDOR WHATSAPP BOT - RESTAURANTE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🚀 Funcionando en puerto ${PORT}`);
  console.log(`📱 Instance ID: ${GREEN_API_CONFIG.idInstance}`);
  console.log('');
  console.log('📌 IMPORTANTE: Configura el webhook en Green API:');
  console.log(`   URL: https://YOUR-URL.com/webhook/green-api`);
  console.log('');
  console.log('   Pasos:');
  console.log('   1. Despliega este servidor en Render.com (gratis)');
  console.log('   2. En Green API, ve a Settings > Notification URL');
  console.log('   3. Pon la URL de tu servidor + /webhook/green-api');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
});