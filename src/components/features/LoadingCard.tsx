export default function LoadingCard() {
  return (
    <div
      className="relative w-full bg-black flex flex-col items-center justify-center"
      style={{ height: '100dvh' }}
    >
      {/* Skeleton background */}
      <div className="absolute inset-0 skeleton opacity-60" />

      {/* Center logo */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl skeleton" />
        <div className="w-40 h-4 rounded-full skeleton" />
        <div className="w-24 h-3 rounded-full skeleton mt-1" />
      </div>

      {/* Bottom skeleton */}
      <div className="absolute bottom-8 left-4 right-16 z-10 space-y-2">
        <div className="w-48 h-5 rounded-full skeleton" />
        <div className="w-32 h-4 rounded-full skeleton" />
        <div className="flex gap-2 mt-2">
          <div className="w-20 h-5 rounded-full skeleton" />
          <div className="w-16 h-5 rounded-full skeleton" />
        </div>
      </div>

      {/* Right sidebar skeleton */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-6 items-center">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full skeleton" />
            <div className="w-8 h-2 rounded-full skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
