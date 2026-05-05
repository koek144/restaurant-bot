const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURACIÓN - SUPABASE
// ============================================
const SUPABASE_URL = 'https://hreueszmzomxjohklaiu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_A3CQofY5XW4dKlMJqeFn8g_3Hlm9L8w';

async function supabaseFetch(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?apikey=${SUPABASE_KEY}`, {
      headers: { 'apikey': SUPABASE_KEY }
    });
    return await res.json();
  } catch (error) {
    console.error(`Error fetching ${table}:`, error);
    return [];
  }
}

async function supabaseInsert(table, data) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?apikey=${SUPABASE_KEY}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (error) {
    console.error(`Error inserting to ${table}:`, error);
    return null;
  }
}

// ============================================
// CONFIGURACIÓN - Green API
// ============================================
const GREEN_API_CONFIG = {
  idInstance: '7107609061',
  apiToken: '82397ed3150843ceb31b389eb75dfa8f1bf536ee0a874fd781',
  apiUrl: 'https://7107.api.greenapi.com'
};

// ============================================
// DATOS DEL RESTAURANTE (se cargan de Supabase)
// ============================================
let restaurantData = {
  mesas: [],
  carta: [],
  sugerencias: [],
  reservas: []
};

const initialMesas = [
  { id: '1', numero: 1, ubicacion: 'interior', capacidad: 4, activa: true },
  { id: '2', numero: 2, ubicacion: 'interior', capacidad: 4, activa: true },
  { id: '3', numero: 3, ubicacion: 'interior', capacidad: 6, activa: true },
  { id: '4', numero: 4, ubicacion: 'exterior', capacidad: 4, activa: true },
  { id: '5', numero: 5, ubicacion: 'exterior', capacidad: 6, activa: true },
  { id: '6', numero: 6, ubicacion: 'exterior', capacidad: 8, activa: true },
  { id: '7', numero: 7, ubicacion: 'alta', capacidad: 2, activa: true },
  { id: '8', numero: 8, ubicacion: 'alta', capacidad: 4, activa: true },
];

const initialCarta = [
  { id: '1', nombre: 'Ensalada César', precio: 8.50, categoria: 'entrantes', disponible: true },
  { id: '2', nombre: 'Carpaccio de ternera', precio: 12.00, categoria: 'entrantes', disponible: true },
  { id: '3', nombre: 'Paella mixta', precio: 18.00, categoria: 'principales', disponible: true },
  { id: '4', nombre: 'Solomillo al whisky', precio: 24.00, categoria: 'principales', disponible: true },
  { id: '5', nombre: 'Tarta de queso', precio: 6.50, categoria: 'postres', disponible: true },
  { id: '6', nombre: 'Tiramisú', precio: 7.00, categoria: 'postres', disponible: true },
  { id: '7', nombre: 'Copa de vino tinto', precio: 4.00, categoria: 'bebidas', disponible: true },
  { id: '8', nombre: 'Refresco', precio: 2.50, categoria: 'bebidas', disponible: true },
];

// Cargar datos de Supabase al iniciar
async function loadDataFromSupabase() {
  console.log('📦 Cargando datos de Supabase...');

  const [mesasData, cartaData, sugerenciasData, reservasData] = await Promise.all([
    supabaseFetch('mesas'),
    supabaseFetch('carta'),
    supabaseFetch('sugerencias'),
    supabaseFetch('reservas')
  ]);

  restaurantData.mesas = mesasData.length > 0 ? mesasData : initialMesas;
  restaurantData.carta = cartaData.length > 0 ? cartaData : initialCarta;
  restaurantData.sugerencias = sugerenciasData;
  restaurantData.reservas = reservasData;

  console.log(`✅ Datos cargados:`);
  console.log(`   - Mesas: ${restaurantData.mesas.length}`);
  console.log(`   - Carta: ${restaurantData.carta.length}`);
  console.log(`   - Sugerencias: ${restaurantData.sugerencias.length}`);
  console.log(`   - Reservas: ${restaurantData.reservas.length}`);
}

// Estados del flujo de conversación
const conversationStates = new Map();

// ============================================
// FUNCIONES DE MENSAJERÍA WHATSAPP
// ============================================

async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const response = await fetch(
      `${GREEN_API_CONFIG.apiUrl}/waInstance${GREEN_API_CONFIG.idInstance}/sendMessage/${GREEN_API_CONFIG.apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: `${phoneNumber}@c.us`,
          message: message
        })
      }
    );
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
    const items = restaurantData.carta.filter(p =>
      p.categoria === cat && (p.disponible !== false)
    );
    if (items.length > 0) {
      items.forEach(p => {
        cartaText += `• ${p.nombre}: €${parseFloat(p.precio).toFixed(2)}\n`;
      });
    } else {
      cartaText += `(sin opciones disponibles)\n`;
    }
  }

  return cartaText;
}

function getSugerencias() {
  let text = `⭐ *Sugerencias del Día*\n\n`;

  const sug = restaurantData.sugerencias.filter(s => s.activa !== false);
  if (sug.length > 0) {
    sug.forEach(s => {
      const precioText = s.precio ? `€${parseFloat(s.precio).toFixed(2)}` : '';
      text += `• ${s.texto} ${precioText ? '- ' + precioText : ''}\n`;
    });
  } else {
    text += `• Paella especial: €15.00\n`;
    text += `• Solomillo del chef: €20.00\n`;
  }

  text += `\n¡Pregunta al camarero!`;
  return text;
}

// ============================================
// LÓGICA DE RESERVAS
// ============================================

function getAvailableTables(fecha, hora, ubicacion, personas) {
  return restaurantData.mesas.filter(m =>
    m.activa && m.ubicacion === ubicacion && m.capacidad >= personas
  );
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
        alternativas.push(...disponibles.map(m => ({ ...m, sugerencia: ub })));
        break;
      }
    }
  }

  return alternativas;
}

function getUbicacionNombre(ubic) {
  const nombres = { interior: 'Interior 🍃', exterior: 'Terraza ☀️', alta: 'Barra Alta 🍸' };
  return nombres[ubic] || ubic;
}

async function handleReservationFlow(phone, message, state) {
  const userInput = message.trim().toLowerCase();
  const originalMessage = message.trim();

  switch (state.step) {
    case 'menu':
      if (originalMessage === '1') {
        return {
          response: `📅 *Reserva de mesa*

Indica la *fecha* de la reserva:
📆 Formato: DD/MM/AAAA
Ejemplo: 15/05/2024

O escribe "hoy" o "mañana"`,
          state: { ...state, step: 'fecha' }
        };
      } else if (originalMessage === '2') {
        return { response: getCarta(), state };
      } else if (originalMessage === '3') {
        return { response: getSugerencias(), state };
      } else {
        return { response: generateMenu(), state };
      }

    case 'fecha':
      let fecha;
      if (originalMessage === 'hoy') {
        fecha = new Date().toISOString().split('T')[0];
      } else if (originalMessage === 'mañana') {
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        fecha = manana.toISOString().split('T')[0];
      } else {
        const parts = originalMessage.split('/');
        if (parts.length === 3) {
          fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else {
          return { response: 'Formato incorrecto. Usa DD/MM/AAAA\nEjemplo: 15/05/2024', state };
        }
      }

      const fechaFormateada = new Date(fecha).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long'
      });

      return {
        response: `📅 Reserva para el *${fechaFormateada}*

⏰ Indica la *hora*:
🕐 Formato: HH:MM
Ejemplo: 20:30`,
        state: { ...state, step: 'hora', fecha }
      };

    case 'hora':
      const horaRegex = /^(\d{1,2}):(\d{2})$/;
      const match = originalMessage.match(horaRegex);
      if (!match) {
        return { response: 'Formato incorrecto. Usa HH:MM\nEjemplo: 20:30', state };
      }
      const hora = `${match[1].padStart(2, '0')}:${match[2]}`;

      return {
        response: `⏰ Hora: *${hora}*

🏠 Indica la *ubicación*:
*1.* Interior 🍃
*2.* Terraza ☀️
*3.* Barra Alta 🍸`,
        state: { ...state, step: 'ubicacion', hora }
      };

    case 'ubicacion':
      const ubicMap = { '1': 'interior', '2': 'exterior', '3': 'alta' };
      const ubicacion = ubicMap[originalMessage];
      if (!ubicacion) {
        return { response: 'Indica 1, 2 o 3', state };
      }

      return {
        response: `🏠 Ubicación: ${getUbicacionNombre(ubicacion)}

👥 ¿Cuántas personas? (1-20)`,
        state: { ...state, step: 'personas', ubicacion }
      };

    case 'personas':
      const personas = parseInt(originalMessage);
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
            response: `❌ No hay disponibilidad en ${getUbicacionNombre(state.ubicacion)}.

✅ *Alternativa:*
${getUbicacionNombre(alternativa.ubicacion)} - Mesa ${alternativa.mesas[0].numero} (${alternativa.mesas[0].capacidad} pers.)

*1.* Aceptar alternativa
*2.* Cambiar fecha
*3.* Cambiar hora
*4.* Volver al menú`,
            state: { ...state, step: 'alternativa', alternativa }
          };
        }

        return {
          response: `❌ No hay disponibilidad para ${personas} personas.

*1.* Cambiar fecha
*2.* Cambiar hora
*3.* Volver al menú`,
          state: { ...state, step: 'cambiar' }
        };
      }

      let msg = `✅ *Mesas disponibles* para ${personas} personas:\n\n`;
      disponibles.forEach((mesa, i) => {
        msg += `*${i + 1}.* Mesa ${mesa.numero} - ${getUbicacionNombre(mesa.ubicacion)} (${mesa.capacidad} pers.)\n`;
      });
      msg += `\nEscribe el número:`;

      return {
        response: msg,
        state: { ...state, step: 'seleccionar_mesa', disponibles, personas }
      };

    case 'seleccionar_mesa':
      const idx = parseInt(originalMessage) - 1;
      if (isNaN(idx) || idx < 0 || idx >= state.disponibles.length) {
        return { response: 'Indica un número de la lista', state };
      }

      const mesaSeleccionada = state.disponibles[idx];

      return {
        response: `✅ Mesa ${mesaSeleccionada.numero} seleccionada

📝 *Tus datos:*

👤 *Nombre*`,
        state: { ...state, step: 'nombre', mesaSeleccionada, mesaIds: [mesaSeleccionada.id] }
      };

    case 'nombre':
      return {
        response: `👤 Apellidos`,
        state: { ...state, step: 'apellidos', nombre: originalMessage }
      };

    case 'apellidos':
      return {
        response: `📞 Teléfono`,
        state: { ...state, step: 'telefono', apellidos: originalMessage }
      };

    case 'telefono':
      return {
        response: `✉️ Email (opcional)`,
        state: { ...state, step: 'email', telefono: originalMessage }
      };

    case 'email':
      const reservaData = {
        fecha: state.fecha,
        hora: state.hora,
        nombre: state.nombre,
        apellidos: state.apellidos,
        telefono: state.telefono,
        email: originalMessage || '',
        personas: state.personas,
        ubicacion: state.ubicacion,
        mesa_numero: state.mesaSeleccionada.numero,
        estado: 'pendiente',
        observaciones: ''
      };

      // Guardar en Supabase
      const result = await supabaseInsert('reservas', reservaData);

      const reserva = {
        id: result && result[0] ? result[0].id : crypto.randomUUID(),
        fecha: state.fecha,
        hora: state.hora,
        nombre: state.nombre,
        apellidos: state.apellidos,
        telefono: state.telefono,
        email: originalMessage || 'no proporcionado',
        personas: state.personas,
        mesaIds: state.mesaIds,
        ubicacion: state.ubicacion,
        estado: 'pendiente',
        createdAt: new Date().toISOString()
      };

      restaurantData.reservas.push(reserva);

      const fechaConfirm = new Date(state.fecha).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long'
      });

      console.log('Nueva reserva:', JSON.stringify(reserva));

      return {
        response: `📋 *¡Reserva solicitada!*

📅 *${fechaConfirm}*
⏰ *${state.hora}*
👥 *${state.personas} personas*
📍 *${getUbicacionNombre(state.ubicacion)}*
🪑 Mesa *${state.mesaSeleccionada.numero}*

👤 ${state.nombre} ${state.apellidos}

⏳ *Pendiente de confirmación*

Te informaremos cuando esté confirmada. 🍽️`,
        state: { step: 'menu' }
      };

    case 'alternativa':
      if (originalMessage === '1') {
        return {
          response: `📝 *Tus datos:*

👤 *Nombre*`,
          state: {
            ...state,
            step: 'nombre',
            ubicacion: state.alternativa.ubicacion,
            mesaSeleccionada: state.alternativa.mesas[0],
            mesaIds: [state.alternativa.mesas[0].id]
          }
        };
      } else if (originalMessage === '2') {
        return { response: 'Indica la nueva fecha (DD/MM/AAAA)', state: { ...state, step: 'fecha' } };
      } else if (originalMessage === '3') {
        return { response: 'Indica la nueva hora (HH:MM)', state: { ...state, step: 'hora' } };
      } else {
        return { response: generateMenu(), state: { step: 'menu' } };
      }

    case 'cambiar':
      if (originalMessage === '1') {
        return { response: 'Indica la nueva fecha (DD/MM/AAAA)', state: { ...state, step: 'fecha' } };
      } else if (originalMessage === '2') {
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

    let phone = '';
    let text = '';

    if (body.typeWebhook === 'incomingMessageReceived') {
      const senderData = body.senderData;
      const msgData = body.messageData;
      phone = senderData.sender.replace('@c.us', '');
      text = msgData.textMessageData?.textMessage || '';
    } else {
      console.log('Tipo de webhook no manejado:', body.typeWebhook);
      res.json({ success: true, ignored: true });
      return;
    }

    if (!phone || !text) {
      console.log('Mensaje sin datos útiles');
      res.json({ success: true, noData: true });
      return;
    }

    console.log(`Mensaje de ${phone}: ${text}`);

    let state = conversationStates.get(phone) || { step: 'menu' };
    const response = await handleReservationFlow(phone, text, state);

    conversationStates.set(phone, response.state);
    await sendWhatsAppMessage(phone, response.response);

    res.json({ success: true, responseSent: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ============================================
// API
// ============================================

app.get('/api/reservas', async (req, res) => {
  const reservas = await supabaseFetch('reservas');
  res.json(reservas);
});

app.post('/api/reservas', async (req, res) => {
  const reserva = {
    ...req.body,
    created_at: new Date().toISOString()
  };
  const result = await supabaseInsert('reservas', reserva);
  res.json(result && result[0] ? result[0] : reserva);
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/reservas?id=eq.${req.params.id}&apikey=${SUPABASE_KEY}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando reserva' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/reservas?id=eq.${req.params.id}&apikey=${SUPABASE_KEY}`;
    await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando reserva' });
  }
});

app.post('/api/reservas/:id/notificar', async (req, res) => {
  const reservas = await supabaseFetch('reservas');
  const reserva = reservas.find(r => r.id === req.params.id);
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const mensaje = req.body.mensaje || `Tu reserva ha sido modificada.\n\nFecha: ${reserva.fecha}\nHora: ${reserva.hora}`;
  await sendWhatsAppMessage(reserva.telefono, mensaje);
  res.json({ success: true });
});

app.get('/api/carta', async (req, res) => {
  const carta = await supabaseFetch('carta');
  res.json(carta.length > 0 ? carta : initialCarta);
});

app.get('/api/mesas', async (req, res) => {
  const mesas = await supabaseFetch('mesas');
  res.json(mesas.length > 0 ? mesas : initialMesas);
});

app.get('/api/sugerencias', async (req, res) => {
  const sugerencias = await supabaseFetch('sugerencias');
  res.json(sugerencias);
});

app.get('/api/status', (req, res) => {
  res.json({
    configured: true,
    estado: 'activo',
    instance: GREEN_API_CONFIG.idInstance,
    supabase: 'conectado'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    reservas: restaurantData.reservas.length
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  await loadDataFromSupabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🍽️  BOT WHATSAPP RESTAURANTE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🚀 Puerto: ${PORT}`);
    console.log(`📱 Instance: ${GREEN_API_CONFIG.idInstance}`);
    console.log(`🗄️  Supabase: ${SUPABASE_URL}`);
    console.log('═══════════════════════════════════════════════════════════');
  });
}

startServer();