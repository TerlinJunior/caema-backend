const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3333;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROTA POST: CADASTRAR USUÁRIO
// ==========================================
app.post('/cadastro', async (req, res) => {
  try {
    const { matricula, nome, senha } = req.body;
    
    if (matricula.toLowerCase() === 'admin') {
      return res.status(400).json({ error: "Matrícula reservada." });
    }

    // Tenta inserir no banco
    const { error } = await supabase
      .from('Usuarios')
      .insert([{ matricula, nome, senha }]);

    // Se der erro, geralmente é porque a matrícula já existe (Primary Key)
    if (error) throw error; 
    
    res.status(201).json({ message: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro no cadastro:", error);
    res.status(500).json({ error: "Falha ao cadastrar. Esta matrícula já existe." });
  }
});

// ==========================================
// ROTA POST: FAZER LOGIN
// ==========================================
app.post('/login', async (req, res) => {
  try {
    const { matricula, senha } = req.body;

    const { data, error } = await supabase
      .from('Usuarios')
      .select('*')
      .eq('matricula', matricula)
      .eq('senha', senha)
      .single(); // Exige que encontre exatamente 1 usuário

    if (error || !data) {
      return res.status(401).json({ error: "Matrícula ou senha incorretos." });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// ==========================================
// ROTA POST: SALVAR NOVA VISTORIA (Técnico)
// ==========================================
app.post('/vistorias', upload.array('fotos'), async (req, res) => {
  try {
    const { categoria, inspetor, itens, cabecalho, rodape } = req.body;
    
    const itensParseados = JSON.parse(itens);
    const cabecalhoParseado = JSON.parse(cabecalho);
    const rodapeParseado = JSON.parse(rodape);

    const idVistoria = Date.now().toString();
    const { error: erroVistoria } = await supabase
      .from('Vistoria')
      .insert([{ 
        id: idVistoria, 
        categoria, 
        inspetor, 
        cabecalho: cabecalhoParseado, 
        rodape: rodapeParseado 
      }]);

    if (erroVistoria) throw erroVistoria;

    for (const item of itensParseados) {
      let urlDaFotoSalva = null;
      const fotoArquivo = req.files?.find(f => f.originalname.includes(`foto_${item.perguntaId}`));
      
      if (fotoArquivo) {
        const nomeArquivo = `${idVistoria}_${item.perguntaId}.jpg`;
        const { error: erroUpload } = await supabase.storage
          .from('fotos-vistorias')
          .upload(nomeArquivo, fotoArquivo.buffer, { contentType: 'image/jpeg' });

        if (!erroUpload) {
          const { data } = supabase.storage.from('fotos-vistorias').getPublicUrl(nomeArquivo);
          urlDaFotoSalva = data.publicUrl;
        }
      }

      await supabase.from('ItemVistoria').insert([{
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        vistoriaId: idVistoria,
        perguntaId: item.perguntaId,
        status: item.status,
        observacao: item.observacao,
        fotoUrl: urlDaFotoSalva
      }]);
    }

    res.status(201).json({ message: "Vistoria recebida e salva com sucesso!" });
  } catch (error) {
    console.error("Erro interno do servidor:", error);
    res.status(500).json({ error: "Falha ao processar a vistoria." });
  }
});

// ==========================================
// ROTA GET: BUSCAR VISTORIAS (Administrador)
// ==========================================
app.get('/vistorias', async (req, res) => {
  try {
    const { data: vistorias, error: erroVistorias } = await supabase
      .from('Vistoria')
      .select('*')
      .order('created_at', { ascending: false });

    if (erroVistorias) throw erroVistorias;

    const { data: itens, error: erroItens } = await supabase
      .from('ItemVistoria')
      .select('*');

    if (erroItens) throw erroItens;

    const vistoriasCompletas = vistorias.map(vist => {
      return {
        ...vist,
        ItemVistoria: itens.filter(item => item.vistoriaId === vist.id)
      };
    });

    res.status(200).json(vistoriasCompletas);
  } catch (error) {
    console.error("Erro ao buscar vistorias:", error);
    res.status(500).json({ error: "Falha ao buscar vistorias da nuvem." });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});