declare module 'sherpa-onnx-node' {
  /**
   * Opaque handle types returned by native constructors. These are opaque
   * JavaScript objects backed by native pointers. Do not introspect or
   * mutate their internals; pass them to the API functions as-is.
   */
  export type OfflineStreamHandle = object;
  export type OnlineStreamHandle = object;
  export type OfflineRecognizerHandle = object;
  export type OnlineRecognizerHandle = object;
  export type DisplayHandle = object;
  export type CircularBufferHandle = object;
  export type VoiceActivityDetectorHandle = object;
  export type AudioTaggingHandle = object;
  export type OfflinePunctuationHandle = object;
  export type LinearResamplerHandle = object;
  export type OfflineTtsHandle = object;
  export type OnlinePunctuationHandle = object;
  export type KeywordSpotterHandle = object;
  export type SpeakerEmbeddingExtractorHandle = object;
  export type SpeakerEmbeddingManagerHandle = object;
  export type SpokenLanguageIdentificationHandle = object;
  export type OfflineSpeakerDiarizationHandle = object;
  export type OfflineSpeechDenoiserHandle = object;
  export type OnlineSpeechDenoiserHandle = object;
  /**
   * A single audio event returned by AudioTagging.compute().
   */
  export type AudioEvent = {
    /**
     * - The event name.
     */
    name: string;
    /**
     * - Probability in [0,1].
     */
    prob: number;
    /**
     * - Index (integer) of the event.
     */
    index: number;
  };
  /**
   * AudioTagging specific model config for Zipformer variant
   */
  export type AudioTaggingZipformerModelConfig = {
    model?: string | undefined;
  };
  /**
   * AudioTagging model config.
   */
  export type AudioTaggingModelConfig = {
    zipformer?: AudioTaggingZipformerModelConfig | undefined;
    ced?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * AudioTagging configuration passed to constructor.
   */
  export type AudioTaggingConfig = {
    model?: AudioTaggingModelConfig | undefined;
    labels?: string | undefined;
    topK?: number | undefined;
  };
  /**
   * Waveform input object used by acceptWaveform methods.
   */
  export type Waveform = {
    /**
     * - Float32Array of samples in [-1, 1].
     */
    samples: Float32Array;
    /**
     * - Sample rate as an integer (e.g., 16000).
     */
    sampleRate: number;
  };
  /**
   * Feature config used by recognizers and models.
   */
  export type FeatureConfig = {
    sampleRate?: number | undefined;
    featureDim?: number | undefined;
  };
  /**
   * Silero VAD model config
   */
  export type SileroVadModelConfig = {
    model?: string | undefined;
    threshold?: number | undefined;
    minSilenceDuration?: number | undefined;
    minSpeechDuration?: number | undefined;
    windowSize?: number | undefined;
    maxSpeechDuration?: number | undefined;
  };
  /**
   * Ten-VAD model config
   */
  export type TenVadModelConfig = {
    model?: string | undefined;
    threshold?: number | undefined;
    minSilenceDuration?: number | undefined;
    minSpeechDuration?: number | undefined;
    windowSize?: number | undefined;
    maxSpeechDuration?: number | undefined;
  };
  /**
   * Voice activity detector configuration.
   */
  export type VadConfig = {
    sileroVad?: SileroVadModelConfig | undefined;
    tenVad?: TenVadModelConfig | undefined;
    sampleRate?: number | undefined;
    numThreads?: number | undefined;
    provider?: string | undefined;
    debug?: number | boolean | undefined;
  };
  /**
   * Offline Transducer model config
   */
  export type OfflineTransducerModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    joiner?: string | undefined;
  };
  /**
   * Offline Paraformer model config
   */
  export type OfflineParaformerModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Zipformer CTC model config
   */
  export type OfflineZipformerCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Wenet CTC model config
   */
  export type OfflineWenetCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Omnilingual ASR CTC model config
   */
  export type OfflineOmnilingualAsrCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Med ASR CTC model config
   */
  export type OfflineMedAsrCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Dolphin model config
   */
  export type OfflineDolphinModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline NeMo CTC model config
   */
  export type OfflineNeMoCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Canary model config
   */
  export type OfflineCanaryModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    srcLang?: string | undefined;
    tgtLang?: string | undefined;
    usePnc?: number | undefined;
  };
  /**
   * Offline Whisper model config
   */
  export type OfflineWhisperModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    language?: string | undefined;
    task?: string | undefined;
    tailPaddings?: number | undefined;
  };
  /**
   * Offline FireRed ASR model config
   */
  export type OfflineFireRedAsrModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
  };
  /**
   * Offline Moonshine model config
   */
  export type OfflineMoonshineModelConfig = {
    preprocessor?: string | undefined;
    encoder?: string | undefined;
    uncachedDecoder?: string | undefined;
    cachedDecoder?: string | undefined;
  };
  /**
   * Offline TDNN model config
   */
  export type OfflineTdnnModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline SenseVoice model config
   */
  export type OfflineSenseVoiceModelConfig = {
    model?: string | undefined;
    language?: string | undefined;
    useInverseTextNormalization?: number | undefined;
  };
  /**
   * Offline Cohere Transcribe model config
   */
  export type OfflineCohereTranscribeModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    language?: string | undefined;
    usePunct?: number | undefined;
    useItn?: number | undefined;
  };
  /**
   * Offline model config.
   */
  export type OfflineModelConfig = {
    transducer?: OfflineTransducerModelConfig | undefined;
    paraformer?: OfflineParaformerModelConfig | undefined;
    zipformerCtc?: OfflineZipformerCtcModelConfig | undefined;
    wenetCtc?: OfflineWenetCtcModelConfig | undefined;
    omnilingual?: OfflineOmnilingualAsrCtcModelConfig | undefined;
    medasr?: OfflineMedAsrCtcModelConfig | undefined;
    dolphin?: OfflineDolphinModelConfig | undefined;
    nemoCtc?: OfflineNeMoCtcModelConfig | undefined;
    canary?: OfflineCanaryModelConfig | undefined;
    whisper?: OfflineWhisperModelConfig | undefined;
    fireRedAsr?: OfflineFireRedAsrModelConfig | undefined;
    moonshine?: OfflineMoonshineModelConfig | undefined;
    tdnn?: OfflineTdnnModelConfig | undefined;
    senseVoice?: OfflineSenseVoiceModelConfig | undefined;
    cohereTranscribe?: OfflineCohereTranscribeModelConfig | undefined;
    tokens?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Transducer model config
   */
  export type TransducerModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    joiner?: string | undefined;
  };
  /**
   * Paraformer model config
   */
  export type ParaformerModelConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
  };
  /**
   * Zipformer2 CTC model config
   */
  export type Zipformer2CtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * NeMo CTC model config
   */
  export type NemoCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Tone CTC model config
   */
  export type ToneCtcModelConfig = {
    model?: string | undefined;
  };
  /**
   * Online model config (subset of C++ `OnlineModelConfig`).
   */
  export type OnlineModelConfig = {
    transducer?: TransducerModelConfig | undefined;
    paraformer?: ParaformerModelConfig | undefined;
    zipformer2Ctc?: Zipformer2CtcModelConfig | undefined;
    nemoCtc?: NemoCtcModelConfig | undefined;
    toneCtc?: ToneCtcModelConfig | undefined;
    tokens?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
    modelType?: string | undefined;
    modelingUnit?: string | undefined;
    bpeVocab?: string | undefined;
    tokensBuf?: string | undefined;
    tokensBufSize?: number | undefined;
  };
  /**
   * Homophone replacer configuration used both in online and offline recognizers.
   */
  export type HomophoneReplacerConfig = {
    lexicon?: string | undefined;
    ruleFsts?: string | undefined;
  };
  /**
   * Online recognizer configuration passed to createOnlineRecognizer.
   */
  export type OnlineRecognizerConfig = {
    featConfig?: FeatureConfig | undefined;
    modelConfig?: OnlineModelConfig | undefined;
    hr?: HomophoneReplacerConfig | undefined;
    decodingMethod?: string | undefined;
    maxActivePaths?: number | undefined;
    enableEndpoint?: number | boolean | undefined;
    rule1MinTrailingSilence?: number | undefined;
    rule2MinTrailingSilence?: number | undefined;
    rule3MinUtteranceLength?: number | undefined;
    hotwordsFile?: string | undefined;
    hotwordsScore?: number | undefined;
    ruleFsts?: string | undefined;
    ruleFars?: string | undefined;
    blankPenalty?: number | undefined;
  };
  /**
   * Offline recognizer config passed to createOfflineRecognizer.
   */
  export type OfflineRecognizerConfig = {
    featConfig?: FeatureConfig | undefined;
    modelConfig?: OfflineModelConfig | undefined;
  };
  /**
   * Wave object returned by readWave and used by writeWave.
   */
  export type WaveObject = {
    /**
     * - 1-D float32 samples in [-1, 1].
     */
    samples: Float32Array;
    /**
     * - Sample rate as an integer (e.g., 16000).
     */
    sampleRate: number;
  };
  /**
   * Speech segment returned by Vad.front().
   */
  export type SpeechSegment = {
    /**
     * - Start index (int32) of this segment.
     */
    start: number;
    /**
     * - Float32Array of samples.
     */
    samples: Float32Array;
  };
  /**
   * Audio returned by TTS and speech denoiser.
   */
  export type GeneratedAudio = {
    /**
     * - The generated/denoised audio samples.
     */
    samples: Float32Array;
    /**
     * - Sample rate in Hz.
     */
    sampleRate: number;
  };
  export type GenerationConfig = {
    silenceScale?: number | undefined;
    speed?: number | undefined;
    sid?: number | undefined;
    numSteps?: number | undefined;
    referenceAudio?: Float32Array | undefined;
    referenceSampleRate?: number | undefined;
    referenceText?: string | undefined;
    extra?:
      | {
          [key: string]: string | number;
        }
      | undefined;
  };
  /**
   * TTS request object passed to generate/generateAsync.
   */
  export type TtsRequest = {
    /**
     * - Input text to synthesize.
     */
    text: string;
    /**
     * - Speaker id (integer).
     */
    sid: number;
    /**
     * - Playback speed (float).
     */
    speed: number;
    /**
     * - Whether to use an external
     * buffer.
     */
    enableExternalBuffer?: boolean | undefined;
    /**
     * - Optional
     */
    generationConfig?: GenerationConfig | undefined;
  };
  /**
   * Spoken Language ID whisper config
   */
  export type SpokenLanguageIdentificationWhisperConfig = {
    encoder?: string | undefined;
    decoder?: string | undefined;
    tailPaddings?: number | undefined;
  };
  /**
   * SpokenLanguageIdentification config
   */
  export type SpokenLanguageIdentificationConfig = {
    whisper?: SpokenLanguageIdentificationWhisperConfig | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Speaker embedding extractor config
   */
  export type SpeakerEmbeddingExtractorConfig = {
    model?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Offline punctuation model config
   */
  export type OfflinePunctuationModelConfig = {
    ctTransformer?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Offline punctuation config
   */
  export type OfflinePunctuationConfig = {
    model?: OfflinePunctuationModelConfig | undefined;
  };
  /**
   * Online punctuation model config
   */
  export type OnlinePunctuationModelConfig = {
    cnnBilstm?: string | undefined;
    bpeVocab?: string | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Online punctuation config
   */
  export type OnlinePunctuationConfig = {
    model?: OnlinePunctuationModelConfig | undefined;
  };
  /**
   * Generic audio processing request used by denoisers/tts generators.
   */
  export type AudioProcessRequest = {
    samples: Float32Array;
    sampleRate: number;
    enableExternalBuffer?: boolean | undefined;
  };
  /**
   * Offline TTS model configs
   */
  export type OfflineTtsVitsModelConfig = {
    model?: string | undefined;
    lexicon?: string | undefined;
    tokens?: string | undefined;
    dataDir?: string | undefined;
    noiseScale?: number | undefined;
    noiseScaleW?: number | undefined;
    lengthScale?: number | undefined;
  };
  export type OfflineTtsMatchaModelConfig = {
    acousticModel?: string | undefined;
    vocoder?: string | undefined;
    lexicon?: string | undefined;
    tokens?: string | undefined;
    dataDir?: string | undefined;
    noiseScale?: number | undefined;
    lengthScale?: number | undefined;
  };
  export type OfflineTtsKokoroModelConfig = {
    model?: string | undefined;
    voices?: string | undefined;
    tokens?: string | undefined;
    dataDir?: string | undefined;
    lengthScale?: number | undefined;
    lexicon?: string | undefined;
    lang?: string | undefined;
  };
  export type OfflineTtsKittenModelConfig = {
    model?: string | undefined;
    voices?: string | undefined;
    tokens?: string | undefined;
    dataDir?: string | undefined;
    lengthScale?: number | undefined;
  };
  export type OfflineTtsZipvoiceModelConfig = {
    tokens?: string | undefined;
    encoder?: string | undefined;
    decoder?: string | undefined;
    vocoder?: string | undefined;
    dataDir?: string | undefined;
    lexicon?: string | undefined;
    featScale?: number | undefined;
    tShift?: number | undefined;
    targetRms?: number | undefined;
    guidanceScale?: number | undefined;
  };
  export type OfflineTtsPocketModelConfig = {
    lmFlow?: string | undefined;
    lmMain?: string | undefined;
    encoder?: string | undefined;
    decoder?: string | undefined;
    textConditioner?: string | undefined;
    vocabJson?: string | undefined;
    tokenScoresJson?: string | undefined;
    voiceEmbeddingCacheCapacity?: number | undefined;
  };
  /**
   * Offline TTS model config
   */
  export type OfflineTtsModelConfig = {
    vits?: OfflineTtsVitsModelConfig | undefined;
    matcha?: OfflineTtsMatchaModelConfig | undefined;
    kokoro?: OfflineTtsKokoroModelConfig | undefined;
    kitten?: OfflineTtsKittenModelConfig | undefined;
    zipvoice?: OfflineTtsZipvoiceModelConfig | undefined;
    pocket?: OfflineTtsPocketModelConfig | undefined;
  };
  /**
   * Offline TTS configuration (partial, commonly used props).
   */
  export type OfflineTtsConfig = {
    model?: OfflineTtsModelConfig | undefined;
    maxNumSentences?: number | undefined;
    silenceScale?: number | undefined;
    numThreads?: number | undefined;
    provider?: string | undefined;
  };
  /**
   * Offline Speech Denoiser model config
   */
  export type OfflineSpeechDenoiserGtcrnModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Speech Denoiser model config
   */
  export type OfflineSpeechDenoiserDpdfNetModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline Speech Denoiser model config
   */
  export type OfflineSpeechDenoiserModelConfig = {
    gtcrn?: OfflineSpeechDenoiserGtcrnModelConfig | undefined;
    dpdfnet?: OfflineSpeechDenoiserDpdfNetModelConfig | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Offline Speech Denoiser configuration (partial).
   */
  export type OfflineSpeechDenoiserConfig = {
    model?: OfflineSpeechDenoiserModelConfig | undefined;
  };
  /**
   * Online Speech Denoiser configuration (partial).
   */
  export type OnlineSpeechDenoiserConfig = {
    model?: OfflineSpeechDenoiserModelConfig | undefined;
  };
  /**
   * Offline speaker segmentation (pyannote) model config
   */
  export type OfflineSpeakerSegmentationPyannoteModelConfig = {
    model?: string | undefined;
  };
  /**
   * Offline speaker segmentation model config
   */
  export type OfflineSpeakerSegmentationModelConfig = {
    pyannote?: OfflineSpeakerSegmentationPyannoteModelConfig | undefined;
    numThreads?: number | undefined;
    debug?: number | boolean | undefined;
    provider?: string | undefined;
  };
  /**
   * Offline Speaker Diarization configuration (partial).
   */
  export type OfflineSpeakerDiarizationConfig = {
    segmentation?: OfflineSpeakerSegmentationModelConfig | undefined;
    embedding?: SpeakerEmbeddingExtractorConfig | undefined;
    clustering?: FastClusteringConfig | undefined;
    minDurationOn?: number | undefined;
    minDurationOff?: number | undefined;
  };
  /**
   * Fast clustering configuration used by diarization.
   */
  export type FastClusteringConfig = {
    numClusters?: number | undefined;
    threshold?: number | undefined;
  };
  /**
   * SpeakerEmbeddingManager add-multi flattened object
   */
  export type SpeakerEmbeddingManagerAddListFlattenedObj = {
    name: string;
    vv: Float32Array;
    n: number;
  };
  /**
   * SpeakerEmbeddingManager search object
   */
  export type SpeakerEmbeddingManagerSearchObj = {
    v: Float32Array;
    threshold: number;
  };
  /**
   * SpeakerEmbeddingManager verify object
   */
  export type SpeakerEmbeddingManagerVerifyObj = {
    name: string;
    v: Float32Array;
    threshold: number;
  };
  /**
   * KeywordSpotter config (partial)
   */
  export type KeywordSpotterConfig = {
    featConfig?: FeatureConfig | undefined;
    modelConfig?: OfflineModelConfig | undefined;
    maxActivePaths?: number | undefined;
    numTrailingBlanks?: number | undefined;
    keywordsScore?: number | undefined;
    keywordsThreshold?: number | undefined;
    keywordsFile?: string | undefined;
  };
  /**
   * Offline recognition result returned by `getOfflineStreamResultAsJson`.
   * See `OfflineRecognitionResult::AsJsonString()` in C++ for precise fields.
   */
  export type OfflineRecognizerResult = {
    lang: string;
    emotion: string;
    event: string;
    text: string;
    timestamps: number[];
    durations: number[];
    tokens: string[];
    ys_log_probs: number[];
    words: number[];
  };
  /**
   * Online recognition result returned by `getOnlineStreamResultAsJson`.
   * See `OnlineRecognizerResult::AsJsonString()` in C++.
   */
  export type OnlineRecognizerResult = {
    text: string;
    tokens: string[];
    timestamps: number[];
    ys_probs: number[];
    lm_probs: number[];
    context_scores: number[];
    segment: number;
    words: number[];
    start_time: number;
    is_final: boolean;
    is_eof: boolean;
  };
  /**
   * Keyword spotter result returned by `getKeywordResultAsJson`.
   */
  export type KeywordResult = {
    start_time: number;
    keyword: string;
    timestamps: number[];
    tokens: string[];
  };
  /**
   * Speaker diarization segment returned by `offlineSpeakerDiarizationProcess`.
   */
  export type SpeakerDiarizationSegment = {
    /**
     * - start time in seconds
     */
    start: number;
    /**
     * - end time in seconds
     */
    end: number;
    /**
     * - speaker id (integer)
     */
    speaker: number;
  };
  /**
   * Speaker embedding entry used by SpeakerEmbeddingManager.add
   */
  export type SpeakerEmbeddingEntry = {
    /**
     * - speaker name
     */
    name: string;
    /**
     * - embedding vector
     */
    v: Float32Array;
  };
  export type OfflineStreamObject = {
    handle: OfflineStreamHandle;
  };
  export type OnlineStreamObject = {
    handle: OnlineStreamHandle;
  };
  export type DisplayObject = {
    handle: DisplayHandle;
  };

  export class OnlineStream {
    readonly handle: OnlineStreamHandle;
    acceptWaveform(waveform: Waveform): void;
    inputFinished(): void;
  }

  export class OnlineRecognizer {
    readonly config: OnlineRecognizerConfig;
    constructor(config: OnlineRecognizerConfig);
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    isEndpoint(stream: OnlineStream): boolean;
    reset(stream: OnlineStream): void;
    getResult(stream: OnlineStream): OnlineRecognizerResult;
  }

  export class OfflineStream {
    readonly handle: OfflineStreamHandle;
    acceptWaveform(waveform: Waveform): void;
    setOption(key: string, value: string): void;
  }

  export class OfflineRecognizer {
    readonly config: OfflineRecognizerConfig;
    constructor(config: OfflineRecognizerConfig);
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(hotwords?: string): OfflineStream;
    setConfig(config: OfflineRecognizerConfig): void;
    decode(stream: OfflineStream): void;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
    getResult(stream: OfflineStream): OfflineRecognizerResult;
  }

  export class CircularBuffer {
    constructor(capacity: number);
    push(samples: Float32Array): void;
    get(startIndex: number, n: number, enableExternalBuffer?: boolean): Float32Array;
    pop(n: number): void;
    size(): number;
    head(): number;
    reset(): void;
  }

  export class Vad {
    readonly config: VadConfig;
    constructor(config: VadConfig, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    clear(): void;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    reset(): void;
    flush(): void;
  }

  export class SpeakerEmbeddingExtractor {
    readonly config: SpeakerEmbeddingExtractorConfig;
    readonly dim: number;
    constructor(config: SpeakerEmbeddingExtractorConfig);
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    compute(stream: OnlineStream, enableExternalBuffer?: boolean): Float32Array;
  }

  export class SpeakerEmbeddingManager {
    readonly dim: number;
    constructor(dim: number);
    add(entry: SpeakerEmbeddingEntry): boolean;
    addMulti(entry: { name: string; v: Float32Array[] }): boolean;
    remove(name: string): boolean;
    search(options: SpeakerEmbeddingManagerSearchObj): string;
    verify(options: SpeakerEmbeddingManagerVerifyObj): boolean;
    contains(name: string): boolean;
    getNumSpeakers(): number;
    getAllSpeakerNames(): string[];
  }

  export function readWave(filename: string): WaveObject;
  export function writeWave(filename: string, wave: WaveObject): void;

  const sherpaOnnx: {
    CircularBuffer: typeof CircularBuffer;
    OfflineRecognizer: typeof OfflineRecognizer;
    OnlineRecognizer: typeof OnlineRecognizer;
    SpeakerEmbeddingExtractor: typeof SpeakerEmbeddingExtractor;
    SpeakerEmbeddingManager: typeof SpeakerEmbeddingManager;
    Vad: typeof Vad;
    readWave: typeof readWave;
    writeWave: typeof writeWave;
  };
  export default sherpaOnnx;
}
