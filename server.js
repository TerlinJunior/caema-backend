const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3333;

// Conexão via HTTPS (Porta 443 - Fura Firewall)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

// Configuração do Multer para receber imagens na memória (RAM) temporariamente
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROTA POST: SALVAR NOVA VISTORIA (Técnico)
// ==========================================
app.post('/vistorias', upload.array('fotos'), async (req, res) => {
  try {
    const { categoria, inspetor, itens, cabecalho, rodape } = req.body;
    
    // Convertendo os textos que vieram do FormData de volta para JSON
    const itensParseados = JSON.parse(itens);
    const cabecalhoParseado = JSON.parse(cabecalho);
    const rodapeParseado = JSON.parse(rodape);

    // 1. Criar a Vistoria Principal no Banco
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

    // 2. Processar Imagens e Salvar Itens Avaliados
    for (const item of itensParseados) {
      let urlDaFotoSalva = null;

      // Procura se o celular enviou uma foto específica para este item
      const fotoArquivo = req.files?.find(f => f.originalname.includes(`foto_${item.perguntaId}`));
      
      if (fotoArquivo) {
        const nomeArquivo = `${idVistoria}_${item.perguntaId}.jpg`;
        
        // Faz o upload da foto para o Bucket 'fotos-vistorias'
        const { error: erroUpload } = await supabase.storage
          .from('fotos-vistorias')
          .upload(nomeArquivo, fotoArquivo.buffer, { contentType: 'image/jpeg' });

        if (!erroUpload) {
          // Pega o link público da foto gerado pelo Supabase
          const { data } = supabase.storage.from('fotos-vistorias').getPublicUrl(nomeArquivo);
          urlDaFotoSalva = data.publicUrl;
        } else {
          console.error("Erro no upload da foto:", erroUpload);
        }
      }

      // Salva a resposta individual do item conectada à Vistoria Principal
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
    // 1. Busca todas as vistorias principais primeiro
    const { data: vistorias, error: erroVistorias } = await supabase
      .from('Vistoria')
      .select('*')
      .order('created_at', { ascending: false });

    if (erroVistorias) throw erroVistorias;

    // 2. Busca todas as respostas e fotos
    const { data: itens, error: erroItens } = await supabase
      .from('ItemVistoria')
      .select('*');

    if (erroItens) throw erroItens;

    // 3. Junta as respostas dentro da vistoria correta aqui no servidor
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
  console.log(`🚀 Servidor rodando na porta ${port} (Comunicação Supabase HTTPS Ativada)`);
});