import fs from "fs";
import generateImage from "./index";
import { saveImage } from "./utils/filemanager";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomSleepTime = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000; // Convert seconds to milliseconds
};

const getTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-');
};

type AspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE' | 'IMAGE_ASPECT_RATIO_PORTRAIT' | 'IMAGE_ASPECT_RATIO_SQUARE';

interface ProxyConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
}

const generateImages = async (
    prompt: string, 
    authToken: string, 
    outputDir: string, 
    generationNumber: number, 
    aspectRatio: AspectRatio,
    proxy?: ProxyConfig
) => {
    try {
        const timestamp = getTimestamp();
        console.log(`[${new Date().toISOString()}] Starting generation #${generationNumber} with ${aspectRatio}...`);
        
        const response = await generateImage({
            prompt: prompt,
            authorization: authToken,
            imageCount: 8,
            seed: null,
            aspectRatio: aspectRatio,
            proxy: proxy
        });

        let imageNumber = 1;
        for (const panel of response.imagePanels) {
            for (const image of panel.generatedImages) {
                const imageName = `${timestamp}-generation-${generationNumber}-${aspectRatio.toLowerCase().replace('image_aspect_ratio_', '')}-${imageNumber++}.png`;
                if (saveImage(imageName, image.encodedImage, outputDir)) {
                    console.log(`[${new Date().toISOString()}] Saved: ${imageName}`);
                }
            }
        }

        console.log(`[${new Date().toISOString()}] Generation #${generationNumber} completed successfully`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during generation #${generationNumber}:`, error);
        // If there's an error, wait longer before retrying
        const sleepTime = getRandomSleepTime(120, 180);
        console.log(`[${new Date().toISOString()}] Waiting ${sleepTime / 1000} seconds before retrying...`);
        await sleep(sleepTime);
    }
};

const parseProxyConfig = (proxyString: string): ProxyConfig | undefined => {
    if (!proxyString) return undefined;
    
    try {
        // Format: http://username:password@host:port
        const proxyUrl = new URL(proxyString);
        return {
            host: proxyUrl.hostname,
            port: parseInt(proxyUrl.port),
            username: proxyUrl.username || undefined,
            password: proxyUrl.password || undefined
        };
    } catch (error) {
        console.error("Invalid proxy format. Expected format: http://username:password@host:port");
        process.exit(1);
    }
};

const main = async () => {
    // Check command line arguments
    if (process.argv.length < 6) {
        console.log("Usage: tsx auto-generate.ts <prompt> <auth-file-path> <generation-count> <aspect-ratio> [output-dir] [proxy]");
        console.log("Aspect ratio options: landscape, portrait, square");
        console.log("Proxy format: http://username:password@host:port");
        process.exit(1);
    }

    const prompt = process.argv[2];
    const authFilePath = process.argv[3];
    const generationCount = parseInt(process.argv[4]);
    const aspectRatio = `IMAGE_ASPECT_RATIO_${process.argv[5].toUpperCase()}` as AspectRatio;
    const outputDir = process.argv[6] || ".";
    const proxyConfig = parseProxyConfig(process.argv[7]);

    if (isNaN(generationCount) || generationCount <= 0) {
        console.error("Generation count must be a positive number");
        process.exit(1);
    }

    if (!['IMAGE_ASPECT_RATIO_LANDSCAPE', 'IMAGE_ASPECT_RATIO_PORTRAIT', 'IMAGE_ASPECT_RATIO_SQUARE'].includes(aspectRatio)) {
        console.error("Invalid aspect ratio. Must be one of: landscape, portrait, square");
        process.exit(1);
    }

    // Read auth token
    let authToken: string;
    try {
        authToken = fs.readFileSync(authFilePath, { encoding: "utf-8" }).trim();
    } catch (error) {
        console.error(`Failed to read auth file: ${authFilePath}`);
        process.exit(1);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Main loop
    let currentGeneration = 1;
    while (currentGeneration <= generationCount) {
        await generateImages(prompt, authToken, outputDir, currentGeneration, aspectRatio, proxyConfig);
        
        if (currentGeneration < generationCount) {
            const sleepTime = getRandomSleepTime(60, 120);
            console.log(`[${new Date().toISOString()}] Sleeping for ${sleepTime / 1000} seconds before next generation...`);
            await sleep(sleepTime);
        } else {
            console.log(`[${new Date().toISOString()}] All ${generationCount} generations completed!`);
        }
        
        currentGeneration++;
    }
};

main().catch(console.error); 