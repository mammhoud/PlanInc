import { useState } from "react";

type FallbackImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string;
  fallbackSrc?: string;
};

export const FallbackImage = ({ src, alt, className, fallbackSrc = "/logo.png", ...props }: FallbackImageProps) => {
    const [error, setError] = useState(false);
    const handleError = () => {
        setError(true);
    };

    if (error) {
        return <img src={'/logo.png'} alt={alt} className={className} {...props} onError={handleError}  />;
    }

    return <img src={error ? fallbackSrc : src} alt={alt} className={className} {...props} onError={handleError} />;
}
