import request from "./utils/request.ts";

interface ProxyConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
}

interface GenerateImageProps {
    seed: number | null;
    prompt: string;
    imageCount: number;
    authorization: string;
    aspectRatio?: 'IMAGE_ASPECT_RATIO_LANDSCAPE' | 'IMAGE_ASPECT_RATIO_PORTRAIT' | 'IMAGE_ASPECT_RATIO_SQUARE';
    proxy?: ProxyConfig;
    modelNameType?: 'IMAGEN_3_1' | 'IMAGEN_4_0';
    tool?: 'IMAGE_FX';
}

interface ModelResponse {
    imagePanels: {
        prompt: string;
        generatedImages: {
            encodedImage: string;
            seed: number;
            mediaGenerationId: string;
            isMaskEditedImage: boolean;
            modelNameType: string;
            workflowId: string;
            fingerprintLogRecordId: string;
        }[];
    }[];
}

interface ErrorResponse {
    error: {
        code: number;
        message: string;
        status: string;
    };
}

const generateImage = async ({
    prompt,
    imageCount,
    authorization,
    seed,
    aspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    modelNameType = 'IMAGEN_3_1',
    tool = 'IMAGE_FX',
}: GenerateImageProps): Promise<ModelResponse> => {
    // Check if this is an API key (starts with AIza) or access token
    const isApiKey = authorization.startsWith('AIza');
    
    return new Promise(
        (
            resolve: (value: ModelResponse) => void,
            reject: (value: ErrorResponse) => void,
        ) => {
            console.log(`[DEBUG] Making request with ${isApiKey ? 'API Key' : 'Access Token'}`);
            console.log(`[DEBUG] Authorization: ${isApiKey ? `Bearer ${authorization.substring(0, 20)}...` : authorization.substring(0, 20) + '...'}`);
            console.log(`[DEBUG] Tool: ${tool}, Model: ${modelNameType}`);
            
            if (isApiKey) {
                // Use Google's Generative AI Images API for API keys. Try both method surfaces.
                const modelPath = modelNameType === 'IMAGEN_4_0'
                    ? 'models/imagen-4.0-generate-preview-06-06'
                    : 'models/imagen-3.0-generate-002';

                const body = {
                    prompt: { text: prompt },
                    imageGenerationConfig: { numberOfImages: imageCount },
                } as any;

                const doPost = async (url: string, payload: any) => {
                    console.log(`[DEBUG] POST ${url}`);
                    console.log(`[DEBUG] Body:`, JSON.stringify(payload, null, 2));
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-goog-api-key': authorization,
                        },
                        body: JSON.stringify(payload),
                    });
                    const status = resp.status;
                    const raw = await resp.text();
                    let data: any = {};
                    try { data = raw ? JSON.parse(raw) : {}; } catch {
                        console.log(`[DEBUG] Raw (${status}):`, raw?.slice(0, 500) || '<empty>');
                        throw { error: { code: status, message: raw || 'Empty response', status: resp.ok ? 'OK' : 'HTTP_ERROR' } } as ErrorResponse;
                    }
                    console.log(`[DEBUG] Response (${status}):`, JSON.stringify(data, null, 2));
                    if (data.error) throw data as ErrorResponse;
                    return data;
                };

                (async () => {
                    try {
                        // 1) models/{model}:generateImages
                        const url1 = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateImages`;
                        const data1 = await doPost(url1, body);
                        const images1 = (data1.images || data1.generatedImages || []) as any[];
                        if (images1.length > 0) {
                            const converted: ModelResponse = {
                                imagePanels: [{
                                    prompt,
                                    generatedImages: images1.map((img: any, index: number) => ({
                                        encodedImage: img?.image?.imageBytes || img?.image?.image_bytes || img?.inlineData?.data || '',
                                        seed: seed || Math.floor(Math.random() * 1000000),
                                        mediaGenerationId: `genai-${Date.now()}-${index}`,
                                        isMaskEditedImage: false,
                                        modelNameType: modelNameType,
                                        workflowId: 'generative-ai-images',
                                        fingerprintLogRecordId: 'genai-images',
                                    })),
                                }],
                            };
                            resolve(converted);
                            return;
                        }
                        console.log('[DEBUG] No images in generateImages; trying images:generate ...');
                        // 2) images:generate
                        const url2 = `https://generativelanguage.googleapis.com/v1beta/images:generate`;
                        const data2 = await doPost(url2, { ...body, model: modelPath });
                        const images2 = (data2.images || data2.generatedImages || []) as any[];
                        if (images2.length === 0) throw { error: { code: 500, message: 'Images API returned no images', status: 'NO_IMAGES' } } as ErrorResponse;
                        const converted2: ModelResponse = {
                            imagePanels: [{
                                prompt,
                                generatedImages: images2.map((img: any, index: number) => ({
                                    encodedImage: img?.image?.imageBytes || img?.image?.image_bytes || img?.inlineData?.data || '',
                                    seed: seed || Math.floor(Math.random() * 1000000),
                                    mediaGenerationId: `genai-${Date.now()}-${index}`,
                                    isMaskEditedImage: false,
                                    modelNameType: modelNameType,
                                    workflowId: 'generative-ai-images',
                                    fingerprintLogRecordId: 'genai-images',
                                })),
                            }],
                        };
                        resolve(converted2);
                    } catch (err: any) {
                        console.log('[DEBUG] Images API attempts failed:', err);
                        reject(err);
                    }
                })();
            } else {
                // Use ImageFX API for access tokens
                request({
                    authorization,
                    method: "POST" as const,
                    reqURL: "https://aisandbox-pa.googleapis.com/v1:runImageFx",
                    body: JSON.stringify({
                        userInput: {
                            candidatesCount: imageCount,
                            prompts: [prompt],
                            seed: seed,
                        },
                        clientContext: {
                            sessionId: ";1740656431200",
                            tool: tool,
                        },
                        modelInput: {
                            modelNameType: modelNameType,
                        },
                        aspectRatio: aspectRatio,
                    }),
                })
            .then((response) => response.json())
            .then((response: any) => {
                console.log(`[DEBUG] Response received:`, JSON.stringify(response, null, 2));
                if (response.error) {
                    console.log(`[DEBUG] Error in response:`, response.error);
                    reject(response as ErrorResponse);
                } else {
                    console.log(`[DEBUG] Success response`);
                    resolve(response as ModelResponse);
                }
            })
            .catch((error) => {
                console.log(`[DEBUG] Request failed:`, error);
                reject(error);
            });
            }
        },
    );
};

export default generateImage;
