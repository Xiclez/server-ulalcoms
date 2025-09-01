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
  // 1. Validar la entrada
  const { matricula } = req.body;

  if (!matricula) {
    return res.status(400).json({ error: 'La matrícula es requerida en el cuerpo de la petición.' });
  }

  try {
    // 2. Definir la consulta SQL con JOINs y alias para facilitar el mapeo
    const sqlQuery = `
      SELECT
        -- Concatena los nombres y les asigna el alias 'Nombre'
        CONCAT(c.FirstName, ' ', c.LastName, ' ', c.LastNameMother) AS Nombre,
        c.Phone AS Telefono,
        isc.DatePay AS FechaInscripcion,
        isc.TotalInscription AS PagoInscripcion,
        isvc.Description AS Curso
      FROM
        [ULAL].[dbo].[Customer] c
      INNER JOIN
        [ULAL].[dbo].[ItemServiceCustomer] isc ON c.CustomerId = isc.CustomerId
      INNER JOIN
        [ULAL].[dbo].[ItemService] isvc ON isc.ItemServiceId = isvc.ItemServiceId
      WHERE
        c.Enrollment = @matricula;
    `;

    // 3. Definir los parámetros para la consulta segura
    const params = {
      matricula: matricula
    };

    // 4. Ejecutar la consulta usando tu helper
    const result = await queryDatabase(sqlQuery, params);

    // 5. Manejar la respuesta
    if (result && result.length > 0) {
      // Si se encontró el alumno, extraemos el primer resultado
      const alumnoInfo = result[0];
      const fechaObj = new Date(alumnoInfo.FechaInscripcion);
      const dia = String(fechaObj.getDate()).padStart(2, '0');
      const mes = String(fechaObj.getMonth() + 1).padStart(2, '0'); // Se suma 1 porque los meses en JS van de 0 a 11
      const anio = fechaObj.getFullYear();

      const fechaFormateada = `${dia}/${mes}/${anio}`;
      // Mapeamos los resultados a la estructura final deseada
      const responseData = {
        'Nombre': alumnoInfo.Nombre,
        'Teléfono': alumnoInfo.Telefono,
        'Curso': alumnoInfo.Curso,
        'Fecha de Inscripción': fechaFormateada,
        'Pago de Inscripción': alumnoInfo.PagoInscripcion,
        
      };

      res.json(responseData);
    } else {
      // Si la consulta no devuelve resultados, el alumno no fue encontrado
      res.status(404).json({ error: `No se encontraron datos para la matrícula: ${matricula}` });
    }

  } catch (error) {
    // Manejo de errores de la base de datos o del servidor
    console.error('Error al consultar la información del alumno:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.' });
  }
});

app.get('/',(res)=>{
res.json("200")
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend corriendo en http://localhost:${port}`);
});
