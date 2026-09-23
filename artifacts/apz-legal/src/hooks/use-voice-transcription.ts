import { useCallback, useEffect, useRef, useState } from "react"
import { transcribeAiAudio } from "@workspace/api-client-react"

export type VoiceStatus = "idle" | "listening" | "processing" | "transcribed" | "cancelled" | "error"

type VoiceError = {
  data?: { error?: string }
  message?: string
  name?: string
  status?: number
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
]

function errorMessage(error: VoiceError) {
  if (error.status === 401) return "Your session expired. Sign in again or continue by typing."
  return error.data?.error || error.message || "Voice transcription failed. You can continue by typing."
}

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null
  if (typeof MediaRecorder.isTypeSupported !== "function") return PREFERRED_MIME_TYPES[0]
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

export function useVoiceTranscription(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [message, setMessage] = useState("")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const failedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const update = useCallback((nextStatus: VoiceStatus, nextMessage = "") => {
    if (mountedRef.current) {
      setStatus(nextStatus)
      setMessage(nextMessage)
    }
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  const transcribe = useCallback(async (blob: Blob) => {
    if (blob.size === 0) {
      update("error", "No audio was captured. Try speaking for a moment before stopping.")
      return
    }

    update("processing", "Transcribing securely…")
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await transcribeAiAudio(blob, {
        signal: controller.signal,
        headers: { "Content-Type": blob.type || "audio/webm" },
      })
      const transcript = result.text.trim()
      if (!transcript) {
        update("error", "No words were detected. Try again or type your request.")
        return
      }
      onTranscript(transcript)
      update("transcribed", "Transcript ready — review and edit it before sending.")
    } catch (error) {
      if ((error as VoiceError).name === "AbortError" || controller.signal.aborted || cancelledRef.current) {
        update("cancelled", "Transcription cancelled. Your text input is still available.")
      } else {
        update("error", errorMessage(error as VoiceError))
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [onTranscript, update])

  const start = useCallback(async () => {
    if (status === "listening" || status === "processing") return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      update("error", "Voice input is not supported in this browser. You can continue by typing.")
      return
    }

    const mimeType = supportedMimeType()
    if (!mimeType) {
      update("error", "This browser does not support a compatible audio format. You can continue by typing.")
      return
    }

    cancelledRef.current = false
    failedRef.current = false
    setMessage("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (cancelledRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        update("cancelled", "Recording cancelled. Your text input is still available.")
        return
      }

      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        failedRef.current = true
        releaseStream()
        update("error", "The browser could not read the microphone. You can continue by typing.")
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType })
        releaseStream()
        if (failedRef.current) {
          failedRef.current = false
          return
        }
        if (cancelledRef.current) {
          update("cancelled", "Recording cancelled. Your text input is still available.")
          return
        }
        void transcribe(blob)
      }
      recorder.start()
      update("listening", "Listening… click stop when you are finished.")
    } catch (error) {
      releaseStream()
      if ((error as VoiceError).name === "NotAllowedError" || (error as VoiceError).name === "PermissionDeniedError") {
        update("error", "Microphone access was denied. Allow microphone access or continue by typing.")
      } else {
        update("error", "The microphone could not be started. You can continue by typing.")
      }
    }
  }, [releaseStream, status, transcribe, update])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    } else {
      releaseStream()
      update("cancelled", "Recording cancelled. Your text input is still available.")
    }
  }, [releaseStream, update])

  const reset = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") recorder.stop()
    else releaseStream()
    update("idle")
  }, [releaseStream, update])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      cancelledRef.current = true
      abortRef.current?.abort()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== "inactive") recorder.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return { status, message, start, stop, cancel, reset }
}