
import React, { useState, useRef, useCallback } from 'react';
import { AppStatus, StructuredReport } from './types';
import { transcribeAudio, refineMedicalReport } from './services/geminiService';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openAiKey, setOpenAiKey] = useState(() => localStorage.getItem('openai_api_key') || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveSettings = () => {
    localStorage.setItem('openai_api_key', openAiKey);
    setIsSettingsOpen(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processAudioFile(file);
  };

  const processAudioFile = async (file: File) => {
    try {
      setStatus(AppStatus.UPLOADING);
      setError(null);
      setAudioUrl(URL.createObjectURL(file));

      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Audio = await base64Promise;

      // 1. Transcription (Flash) - Interprets punctuation like "punto aparte"
      setStatus(AppStatus.TRANSCRIBING);
      const rawText = await transcribeAudio(base64Audio, file.type, file);

      // 2. Refinement (Pro + Thinking) - Structures for UI display
      setStatus(AppStatus.REFINING);
      const structuredData = await refineMedicalReport(rawText);

      setReport(structuredData);
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during processing.');
      setStatus(AppStatus.ERROR);
    }
  };

  const downloadDoc = () => {
    if (!report) return;

    // DEFINIMOS LA SANGRÍA MANUAL
    const sangria = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'; 

    const formattedText = report.originalText
        // 1. Limpiamos saltos de línea previos para procesar todo como texto continuo
        .replace(/\n/g, ' ') 
        
        // 2. DIVISIÓN INTELIGENTE (REGEX):
        // \.      -> Busca un punto literal.
        // (?!\d)  -> "Negative Lookahead": Significa "que NO esté seguido de un dígito".
        // Esto separa oraciones, pero ignora "1.5", "3.0", etc.
        .split(/\.(?!\d)/) 
        
        .filter(fragment => {
            const trimmed = fragment.trim();
            if (!trimmed) return false;
            if (trimmed.toLowerCase().includes('informe de')) return false;
            if (trimmed.toLowerCase().includes('paciente:')) return false;
            return true;
        })
        .map(fragment => {
            // Como el split "se come" el punto, lo volvemos a poner al final.
            const line = fragment.trim() + '.'; 
            return `<p class="doc-paragraph">${sangria}${line}</p>`;
        })
        .join(''); 

    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Reporte Médico</title>
        <style>
          p, div { margin: 0; padding: 0; }
          
          .doc-paragraph {
              margin: 0;
              line-height: 1.0; 
              text-align: justify; 
              font-size: 12pt;
          }

          .study-name { text-decoration: underline; font-weight: bold; font-size: 14pt; margin-bottom: 20px; text-transform: uppercase; }
          .content { font-family: 'Arial', sans-serif; margin-top: 10px; }
          .signature-atte { text-align: center; margin-top: 40px; font-weight: bold; }
          .signature-details { text-align: right; margin-top: 10px; font-size: 11pt; }
        </style>
      </head>
      <body>
        <div class="study-name">
          ${report.studyName || 'REPORTE MÉDICO'}
        </div>
        
        <div class="content">
          ${formattedText}
        </div>

        <div class="signature-atte">
          ATTE
        </div>

        <div class="signature-details">
          Dr. Rubén Luis Brodsky<br/>
          Especialista en Radiología<br/>
          M.N. 63574 - M.P. 1601
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', content], {
      type: 'application/msword'
    });
    
    
    

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(report.studyName || 'Transcripcion').replace(/\s+/g, '_')}_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setStatus(AppStatus.IDLE);
    setReport(null);
    setAudioUrl(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 relative">
      <div className="absolute top-4 right-4">
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-200"
          title="Configuración"
        >
          <i className="fa-solid fa-gear text-xl"></i>
        </button>
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">OpenAI API Key (Opcional)</label>
              <p className="text-xs text-slate-500 mb-3">Si se proporciona, se usará OpenAI (Whisper y GPT-4o) con prioridad. Si se deja en blanco o falla, se usará Gemini como respaldo.</p>
              <input 
                type="password" 
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={saveSettings}
                className="px-5 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-4xl w-full mb-12 text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200">
            <i className="fa-solid fa-notes-medical text-white text-3xl"></i>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">MedScribe <span className="text-blue-600">AI</span></h1>
        </div>
        <p className="text-slate-500 text-lg">Transcripción Médica Inteligente</p>
      </header>

      <main className="max-w-4xl w-full">
        {status === AppStatus.IDLE && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group cursor-pointer bg-white border-2 border-dashed border-slate-300 rounded-3xl p-16 text-center transition-all hover:border-blue-500 hover:bg-blue-50/50"
          >
            <input 
              type="file" 
              accept="audio/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
            />
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-100 transition-colors">
              <i className="fa-solid fa-microphone-lines text-slate-400 text-3xl group-hover:text-blue-600"></i>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Subir Audio Médico</h2>
            <p className="text-slate-500 max-w-sm mx-auto">
              Sube tu archivo de voz. Se interpretarán comandos y correcciones automáticamente.
            </p>
          </div>
        )}

        {(status === AppStatus.UPLOADING || status === AppStatus.TRANSCRIBING || status === AppStatus.REFINING) && (
          <div className="bg-white rounded-3xl p-12 shadow-xl shadow-slate-200 text-center border border-slate-100">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              {status === AppStatus.UPLOADING && 'Subiendo Audio...'}
              {status === AppStatus.TRANSCRIBING && 'Transcribiendo Reporte...'}
              {status === AppStatus.REFINING && 'Analizando Contenido...'}
            </h3>
            <p className="text-slate-500 italic max-w-md mx-auto">
              {status === AppStatus.TRANSCRIBING && 'Procesando correcciones de voz y puntuación clínica.'}
              {status === AppStatus.REFINING && 'Identificando el nombre del estudio y estructurando secciones.'}
            </p>
          </div>
        )}

        {status === AppStatus.ERROR && (
          <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center">
            <i className="fa-solid fa-circle-exclamation text-red-500 text-4xl mb-4"></i>
            <h3 className="text-xl font-bold text-red-900 mb-2">Error de Procesamiento</h3>
            <p className="text-red-700 mb-6">{error}</p>
            <button 
              onClick={reset}
              className="bg-white border border-red-200 text-red-600 px-6 py-2 rounded-xl font-medium hover:bg-red-100 transition-colors"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {status === AppStatus.COMPLETED && report && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Estudio Detectado</span>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center">
                    <i className="fa-solid fa-file-medical text-blue-600 mr-3"></i>
                    {report.studyName}
                  </h2>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={downloadDoc}
                    title="Descargar transcripción limpia"
                    className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                  >
                    <i className="fa-solid fa-file-word"></i>
                    <span>Bajar Transcripción (.doc)</span>
                  </button>
                  <button 
                    onClick={reset}
                    className="flex items-center space-x-2 bg-slate-100 text-slate-600 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    <i className="fa-solid fa-rotate-left"></i>
                    <span>Nuevo</span>
                  </button>
                </div>
              </div>

              {audioUrl && (
                <div className="mb-8 p-4 bg-slate-50 rounded-2xl flex items-center space-x-4">
                  <i className="fa-solid fa-circle-play text-blue-500 text-xl"></i>
                  <audio src={audioUrl} controls className="w-full h-10 accent-blue-600" />
                </div>
              )}

              <div className="grid grid-cols-1 gap-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Texto Final de la Transcripción</h3>
                  <div className="text-slate-800 leading-relaxed whitespace-pre-wrap text-lg">
                    {report.originalText}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Resumen de Análisis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.patientInfo && (
                      <MiniSection title="Paciente" content={report.patientInfo} icon="fa-user" />
                    )}
                    <MiniSection title="Hallazgos" content={report.findings} icon="fa-stethoscope" />
                    <MiniSection title="Diagnóstico" content={report.diagnosis} icon="fa-microscope" />
                    <MiniSection title="Plan" content={report.plan} icon="fa-clipboard-check" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto pt-12 pb-6 text-slate-400 text-sm">
        <p>© 2024 MedScribe AI. Firmado por Dr. Rubén Luis Brodsky.</p>
      </footer>
    </div>
  );
};

const MiniSection: React.FC<{ title: string; content?: string; icon: string }> = ({ title, content, icon }) => {
  if (!content) return null;
  return (
    <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
      <h4 className="flex items-center text-xs font-bold text-blue-600 uppercase mb-2">
        <i className={`fa-solid ${icon} mr-1.5`}></i>
        {title}
      </h4>
      <p className="text-slate-600 text-sm line-clamp-3">{content}</p>
    </div>
  );
};

export default App;
