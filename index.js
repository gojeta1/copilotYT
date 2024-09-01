document.addEventListener('DOMContentLoaded', function() {
    const videoUrlInput = document.getElementById('videoUrl');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const results = document.getElementById('results');
    const suggestedTitle = document.getElementById('suggestedTitle');
    const suggestedDescription = document.getElementById('suggestedDescription');
    const suggestedTags = document.getElementById('suggestedTags');
    const thumbnailSuggestions = document.getElementById('thumbnailSuggestions');
    const videoTranscript = document.getElementById('videoTranscript');

    analyzeBtn.addEventListener('click', async function() {
        const videoUrl = videoUrlInput.value.trim();
        if (!videoUrl) {
            alert('Por favor, insira um URL de vídeo válido.');
            return;
        }

        try {
            analyzeBtn.textContent = 'Analisando...';
            analyzeBtn.disabled = true;
            results.classList.add('hidden');
            await transcribeVideo(videoUrl);
        } catch (error) {
            alert('Ocorreu um erro ao analisar o vídeo: ' + error.message);
        }
    });
    async function transcribeVideo(videoUrl) {
        try {
            const apiUrl = 'http://localhost:10000/transcribe';

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Origin': 'chrome-extension://' + chrome.runtime.id,
                },
                body: JSON.stringify({ videoUrl: videoUrl }),
            });

            if (!response.ok) {
                throw new Error(`Erro na resposta do servidor: ${response.status} ${response.statusText}`);
            }

            const responseData = await response.json();
            console.log('Resposta do servidor:', responseData);

            if (responseData.error) {
                throw new Error(responseData.error);
            }

            // Busca os dados do Airtable após a conclusão do fluxo no n8n
            await fetchAirtableData(videoUrl);
            
        } catch (error) {
            console.error('Erro na requisição:', error);
            if (error.message.includes('Subtitles are disabled for this video')) {
                throw new Error('As legendas estão desativadas para este vídeo. Por favor, tente outro vídeo com legendas disponíveis.');
            } else {
                throw new Error(`Falha na comunicação com o servidor: ${error.message}`);
            }
        }
    }

    async function fetchAirtableData(videoUrl) {
        const searchResponse = await fetch(`https://api.airtable.com/v0/app1QgNkjdrTRwIxB/Transcrições`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer patvbrtKYLj5eJCFm.35b0e1ca60d35eabaa5f89beff57bb2a426670719f7b9e0010eb14f83ddedabf',
                'Content-Type': 'application/json',
            },
        });

        if (!searchResponse.ok) {
            throw new Error('Falha ao buscar dados do Airtable');
        }

        const searchData = await searchResponse.json();
        if (searchData.records.length === 0) {
            throw new Error('Nenhum registro encontrado no Airtable para o URL do vídeo fornecido');
        }

        // Verificar o status do registro mais recente a cada 5 segundos
        const checkStatusInterval = setInterval(async () => {
            const recordResponse = await fetch(`https://api.airtable.com/v0/app1QgNkjdrTRwIxB/Transcrições/${mostRecentRecord}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer patvbrtKYLj5eJCFm.35b0e1ca60d35eabaa5f89beff57bb2a426670719f7b9e0010eb14f83ddedabf',
                    'Content-Type': 'application/json',
                },
            });

            if (!recordResponse.ok) {
                clearInterval(checkStatusInterval);
                throw new Error('Falha ao buscar dados do registro específico no Banco de Dados');
            }
                   // Ordenar os registros pela data mais recente, incluindo minutos e segundos
            searchData.records.sort((a, b) => {
                const dateA = new Date(a.createdTime);
                const dateB = new Date(b.createdTime);
                return dateB - dateA; // Isso já leva em conta horas, minutos e segundos
            });

            // Filtrar registros com o mesmo URL do vídeo
            const matchingRecords = searchData.records.filter(record => record.fields.link === videoUrl);

            if (matchingRecords.length === 0) {
                throw new Error('Nenhum registro encontrado para o URL do vídeo fornecido');
            }

            // Pegar o registro mais recente com o URL correspondente
            const mostRecentRecord = matchingRecords[0].id;

            console.log(`Registro mais recente para o vídeo: ${mostRecentRecord}, criado em: ${matchingRecords[0].createdTime}`);

            const recordData = await recordResponse.json();

            if (recordData.fields.status === 'Concluido') {
                clearInterval(checkStatusInterval);
                displayResults(recordData);
                results.classList.remove('hidden');
            } else {
                console.log(`Status atual: ${recordData.fields.status}`);
            }
        }, 10000);
        // Timeout após 1 minuto se o status não for concluído
        setTimeout(() => {
            clearInterval(checkStatusInterval);
            fetch(`https://api.airtable.com/v0/app1QgNkjdrTRwIxB/Transcrições/${mostRecentRecord}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer patvbrtKYLj5eJCFm.35b0e1ca60d35eabaa5f89beff57bb2a426670719f7b9e0010eb14f83ddedabf',
                    'Content-Type': 'application/json',
                },
            })
            .then(response => response.json())
            .then(data => {
                throw new Error(`Não foi possível concluir a análise, status final: ${data.fields.status}`);
            })
            .catch(error => {
                console.error('Erro ao verificar o status final:', error);
                throw new Error('Não foi possível concluir a análise dentro do tempo limite');
            });
        }, 120000);
    }

    function displayResults(recordData) {
        analyzeBtn.textContent = 'Analisar Vídeo';
        analyzeBtn.disabled = false;

        suggestedTitle.innerHTML = formatText(recordData.fields.titulos) || 'Título não disponível';
        suggestedDescription.innerHTML = formatText(recordData.fields.descrição) || 'Descrição não disponível';
        suggestedTags.innerHTML = formatText(recordData.fields.palavraschaves) || 'Tags não disponíveis';
        
        thumbnailSuggestions.innerHTML = ''; // Limpa o conteúdo existente
        if (recordData.fields.thumbnail) {
            const img = document.createElement('img');
            img.src = recordData.fields.thumbnail;
            img.alt = 'Sugestão de Thumbnail';
            img.style.maxWidth = '100%';
            img.style.marginBottom = '10px';
            thumbnailSuggestions.appendChild(img);
        } else {
            thumbnailSuggestions.textContent = 'Sugestões de thumbnail não disponíveis';
        }

        videoTranscript.innerHTML = formatText(recordData.fields.resumoMake) || 'Resumo não disponível';
    }

    function formatText(text) {
        if (!text) return '';
        return text.replace(/\n/g, '<br>')
                   .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\*(.*?)\*/g, '<em>$1</em>')
                   .replace(/`(.*?)`/g, '<code>$1</code>')
                   .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    }
});