import { Composition } from 'remotion';
import { HowToGetCard, TOTAL_FRAMES } from './HowToGetCard';

export const RemotionRoot = () => {
    return (
        <Composition
            id="HowToGetCard"
            component={HowToGetCard}
            durationInFrames={TOTAL_FRAMES}
            fps={30}
            width={1920}
            height={1080}
        />
    );
};
