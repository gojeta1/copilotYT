import requests
from youtube_transcript_api import YouTubeTranscriptApi
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def get_video_id(url):
    if 'youtu.be' in url:
        return url.split('/')[-1]
    elif 'youtube.com' in url:
        return url.split('v=')[1].split('&')[0]
    else:
        raise ValueError("URL do YouTube inválida")

def get_transcript(video_id):
    try:
        print(f"Tentando obter a transcrição para o vídeo ID: {video_id}")
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['pt'])
        print(f"Transcrição obtida com sucesso: {transcript}")
        return ' '.join([entry['text'] for entry in transcript])
    except Exception as e:
        print(f"Erro ao obter a transcrição: {str(e)}", file=sys.stderr)
        return None

def send_transcript_to_webhook(webhook_url, video_url, transcript):
    payload = {
        'videoUrl': video_url,
        'transcript': transcript
    }
    try:
        response = requests.post(webhook_url, json=payload)
        response.raise_for_status()
        print("Transcrição enviada com sucesso para o webhook")
        print(f"Resposta do servidor: {response.text}")
        return {"message": "Transcrição enviada com sucesso"}
    except requests.RequestException as e:
        print(f"Erro ao enviar transcrição: {e}", file=sys.stderr)
        print(f"Resposta do servidor: {e.response.text if e.response else 'Sem resposta'}", file=sys.stderr)
        return None

@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "Bem-vindo à API de transcrição de vídeos do YouTube"}), 200

@app.route('/transcribe', methods=['POST'])
def transcribe():
    webhook_url = 'https://guilhermebbcc.app.n8n.cloud/webhook-test/20837bb6-04d4-48fc-91c8-26919f4baac9'
    
    if not request.is_json:
        return jsonify({"error": "Conteúdo deve ser JSON"}), 400
    
    video_url = request.json.get('videoUrl')
    return jsonify(video_url)

    if not video_url:
        return jsonify({"error": "URL do vídeo não fornecida"}), 400

    try:
        print(f"URL do vídeo recebida: {video_url}")
        # video_id = get_video_id(video_url)
        video_id = "dQw4w9WgXcQ"
        transcript = get_transcript(video_id)
        
        if transcript:
            print(f"Transcrição para o vídeo {video_id} obtida com sucesso.")
            response = send_transcript_to_webhook(webhook_url, video_url, transcript)
            if response:
                return jsonify(response)
            else:
                return jsonify({"error": "Erro ao enviar transcrição para o webhook"}), 500
        else:
            print(f"Não foi possível obter a transcrição para o vídeo {video_id}")
            error_message = "Não foi possível obter a transcrição. Verifique se o vídeo tem legendas disponíveis."
            send_transcript_to_webhook(webhook_url, video_url, error_message)
            return jsonify({"error": error_message}), 404
    except Exception as e:
        print(f"Erro durante o processamento: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=10000, debug=True)
