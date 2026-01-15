import { YOUTUBE_API_KEY, YOUTUBE_API_URL } from '../config';

export const searchVideos = async (query) => {
    if (!query) return [];

    try {
        // Search endpoint: part=snippet ensures we get title/thumbnails
        const url = `${YOUTUBE_API_URL}/search?part=snippet&maxResults=15&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            // detailed error message from Google (e.g. "Quota Exceeded")
            throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.items) return [];

        // Normalize to our app's video format
        return data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title, // Note: Contains HTML entities sometimes
            channel: item.snippet.channelTitle,
            thumb: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url
        }));

    } catch (error) {
        console.error("YouTube API Error:", error);
        throw error; // Re-throw to let UI handle it
    }
};
