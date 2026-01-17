import React, { useState } from 'react';
import { FolderOpen, Music, Plus, Upload, Trash2, Search } from 'lucide-react';

interface Track {
    id: string;
    file: File;
    name: string;
    bpm?: number;
}

interface LibraryProps {
    onLoad: (file: File, deck: 'A' | 'B') => void;
}

const Library: React.FC<LibraryProps> = ({ onLoad }) => {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newTracks = Array.from(e.target.files).map((file: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                file: file as File,
                name: file.name,
                bpm: Math.floor(Math.random() * (130 - 120) + 120) // Simulated BPM
            }));
            setTracks([...tracks, ...newTracks]);
        }
    };

    const removeTrack = (id: string) => {
        setTracks(prev => prev.filter(t => t.id !== id));
    };

    const filteredTracks = tracks.filter(t => 
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="bg-gray-900 border-r border-gray-800 w-full md:w-64 flex flex-col h-[300px] md:h-auto overflow-hidden flex-shrink-0">
            <div className="p-4 border-b border-gray-800 flex flex-col gap-3 bg-black/20">
                <div className="flex justify-between items-center">
                    <h2 className="text-sm font-bold font-tech text-gray-300 flex items-center gap-2">
                        <FolderOpen size={16} /> LIBRARY
                    </h2>
                    <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 p-1.5 rounded transition-colors group relative" title="Add Files">
                        <Plus size={16} />
                        <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileAdd} />
                    </label>
                </div>
                {/* Search Bar */}
                <div className="relative">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()} // Prevent triggering deck shortcuts
                        placeholder="Search tracks..."
                        className="w-full bg-gray-950 border border-gray-700 rounded py-1 pl-8 pr-2 text-xs text-gray-300 focus:outline-none focus:border-cyan-500/50"
                    />
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto no-scrollbar p-2 space-y-1">
                {tracks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                        <Upload size={24} />
                        <span className="text-xs">Add MP3 Files</span>
                    </div>
                ) : (
                    filteredTracks.map(track => (
                        <div key={track.id} className="group bg-gray-800/50 hover:bg-gray-800 p-2 rounded flex flex-col gap-2 transition-all border border-transparent hover:border-gray-700 relative pr-6">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <Music size={14} className="text-gray-500 flex-shrink-0" />
                                <span className="text-xs font-medium truncate text-gray-300 w-full" title={track.name}>{track.name}</span>
                            </div>
                            
                            {/* Remove Button (Visible on Hover) */}
                            <button 
                                onClick={() => removeTrack(track.id)}
                                className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                title="Remove from Library"
                            >
                                <Trash2 size={12} />
                            </button>

                            <div className="flex gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => onLoad(track.file, 'A')}
                                    className="flex-1 bg-cyan-900/50 hover:bg-cyan-600 text-cyan-200 text-[10px] py-1 rounded text-center border border-cyan-900 transition-colors"
                                >
                                    LOAD A
                                </button>
                                <button 
                                    onClick={() => onLoad(track.file, 'B')}
                                    className="flex-1 bg-fuchsia-900/50 hover:bg-fuchsia-600 text-fuchsia-200 text-[10px] py-1 rounded text-center border border-fuchsia-900 transition-colors"
                                >
                                    LOAD B
                                </button>
                            </div>
                        </div>
                    ))
                )}
                {tracks.length > 0 && filteredTracks.length === 0 && (
                     <div className="text-center text-gray-600 text-[10px] mt-4">No matching tracks</div>
                )}
            </div>
        </div>
    );
};

export default Library;