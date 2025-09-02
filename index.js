import express from "express";
import cors from "cors";
import sql from 'mssql';
import dotenv from "dotenv";
dotenv.config();


const app = express();
const port = 3000

const dbConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER_IP,
  database: process.env.SQL_DBNAME,

  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

async function queryDatabase(query, params) {
  let pool;
  try {
    console.log('Intentando conectar con el servidor:', process.env.SQL_SERVER_IP);
    pool = await sql.connect(dbConfig);
    const request = pool.request();
    
    // Si hay parámetros, agrégalos para prevenir la inyección SQL
    if (params) {
      for (const key in params) {
        request.input(key, params[key]);
      }
    }

    const result = await request.query(query);
    return result.recordset;

  } catch (error) {
    console.error('Error en la base de datos:', error);
    throw error; // Propaga el error para que el servidor lo maneje
  } finally {
    if (pool) {
      pool.close();
    }
  }
}


app.post('/alumno/info', async (req, res) => {
  const { matricula } = req.body;

  if (!matricula) {
    return res.status(400).json({ error: 'La matrícula es requerida en el cuerpo de la petición.' });
  }

  try {
    // --- CONSULTA SQL ACTUALIZADA ---
    const sqlQuery = `
      SELECT
        CONCAT(c.FirstName, ' ', c.LastName, ' ', c.LastNameMother) AS Nombre,
        c.Phone AS Telefono,
        isc.DatePay AS FechaInscripcion,
        isc.TotalInscription AS PagoInscripcion,
        isvc.Description AS Curso,
        
        -- INICIO: Nueva lógica para verificar el pago
        CASE 
          WHEN iscp.isPaid = 1 THEN 'Sí'
          ELSE 'No'
        END AS Pagado
        -- FIN: Nueva lógica para verificar el pago

      FROM
        [ULAL].[dbo].[Customer] c
      INNER JOIN
        [ULAL].[dbo].[ItemServiceCustomer] isc ON c.CustomerId = isc.CustomerId
      INNER JOIN
        [ULAL].[dbo].[ItemService] isvc ON isc.ItemServiceId = isvc.ItemServiceId
      LEFT JOIN -- Usamos LEFT JOIN para incluir alumnos aunque no tengan registro de pago
        [ULAL].[dbo].[ItemServiceCustomerPayment] iscp ON isc.ItemServiceCustomerId = iscp.ItemServiceCustomerId
        AND iscp.Description = 'Inscripción' -- Condición específica para el tipo de pago
      WHERE
        c.Enrollment = @matricula;
    `;

    const params = {
      matricula: matricula
    };

    const result = await queryDatabase(sqlQuery, params);

    if (result && result.length > 0) {
      const alumnoInfo = result[0];

      // Formateo de la fecha (si lo sigues usando)
      const fechaObj = new Date(alumnoInfo.FechaInscripcion);
      const dia = String(fechaObj.getDate()).padStart(2, '0');
      const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
      const anio = fechaObj.getFullYear();
      const fechaFormateada = `${dia}/${mes}/${anio}`;

      const responseData = {
        'Nombre': alumnoInfo.Nombre,
        'Teléfono': alumnoInfo.Telefono,
        'Fecha de Inscripción': fechaFormateada,
        'Monto de Inscripción': alumnoInfo.PagoInscripcion,
        'Curso': alumnoInfo.Curso,
        'Pagado': alumnoInfo.Pagado // <-- AÑADIMOS EL NUEVO CAMPO A LA RESPUESTA
      };

      res.json(responseData);
    } else {
      res.status(404).json({ error: `No se encontraron datos para la matrícula: ${matricula}` });
    }

  } catch (error) {
    console.error('Error al consultar la información del alumno:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.' });
  }
});

app.get('/', (req, res) => {
  res.json("200");
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend corriendo en http://localhost:${port}`);
});
