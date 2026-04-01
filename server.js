const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3333;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// CADASTRAR USUÁRIO
app.post('/cadastro', async (req, res) => {
  try {
    const { matricula, nome, senha } = req.body;
    if (matricula.toLowerCase() === 'admin') return res.status(400).json({ error: "Reserva de sistema." });

    const { error } = await supabase.from('Usuarios').insert([{ matricula, nome, senha }]);
    if (error) throw error; 
    res.status(201).json({ message: "Sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Matrícula já cadastrada ou erro de conexão." });
  }
});

// LOGIN
app.post('/login', async (req, res) => {
  try {
    const { matricula, senha } = req.body;
    const { data, error } = await supabase.from('Usuarios').select('*').eq('matricula', matricula).eq('senha', senha).single();
    if (error || !data) return res.status(401).json({ error: "Dados incorretos." });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Erro no servidor." });
  }
});

// SALVAR VISTORIA
app.post('/vistorias', upload.array('fotos'), async (req, res) => {
  try {
    const { categoria, inspetor, itens, cabecalho, rodape } = req.body;
    const itensParseados = JSON.parse(itens);
    const idVistoria = Date.now().toString();

    // 1. Salva a Vistoria Pai
    const { error: erroVistoria } = await supabase.from('Vistoria').insert([{ 
        id: idVistoria, categoria, inspetor, 
        cabecalho: JSON.parse(cabecalho), 
        rodape: JSON.parse(rodape) 
    }]);
    if (erroVistoria) throw erroVistoria;

    // 2. Processa os Itens
    const promessasItens = itensParseados.map(async (item) => {
      let urlDaFotoSalva = null;
      
      // Procura a foto específica para este ID de pergunta
      const fotoArquivo = req.files?.find(f => f.originalname.includes(`foto_${item.perguntaId}`));
      
      if (fotoArquivo) {
        // Nome único usando timestamp para evitar cache ou sobreposição
        const nomeArquivo = `${idVistoria}_${item.perguntaId}_${Date.now()}.jpg`;
        const { error: erroUpload } = await supabase.storage
          .from('fotos-vistorias')
          .upload(nomeArquivo, fotoArquivo.buffer, { contentType: 'image/jpeg' });

        if (!erroUpload) {
          const { data } = supabase.storage.from('fotos-vistorias').getPublicUrl(nomeArquivo);
          urlDaFotoSalva = data.publicUrl;
        }
      }

      return supabase.from('ItemVistoria').insert([{
        vistoriaId: idVistoria,
        perguntaId: item.perguntaId,
        status: item.status,
        observacao: item.observacao,
        fotoUrl: urlDaFotoSalva
      }]);
    });

    await Promise.all(promessasItens);
    res.status(201).json({ message: "Vistoria Salva!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar." });
  }
});

// BUSCAR VISTORIAS (Otimizado)
app.get('/vistorias', async (req, res) => {
  try {
    // Buscamos as vistorias já trazendo seus itens relacionados (Inner Join do Supabase)
    const { data, error } = await supabase
      .from('Vistoria')
      .select(`
        *,
        ItemVistoria (*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar." });
  }
});

app.listen(port, () => console.log(`🚀 Porta ${port}`));