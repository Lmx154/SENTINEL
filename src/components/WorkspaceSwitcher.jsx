import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Plus, Monitor } from 'lucide-react';
import { cn } from "../utils";

function WorkspaceSwitcher({ activeWorkspace, workspaces, onSwitchWorkspace, onCreateWorkspace }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        }
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-1 bg-gray-300 hover:bg-gray-400 px-3 py-1.5 rounded"
            >
                <LayoutGrid size={16} />
                <span>Workspace {activeWorkspace + 1}</span>
            </button>
            
            {isMenuOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white shadow-lg rounded-md py-1 z-50 border border-gray-300">
                    <div className="py-1 px-3 text-sm font-medium text-gray-700 border-b border-gray-200">
                        Workspaces
                    </div>
                    
                    {workspaces.map((workspace, index) => (
                        <button 
                            key={index}
                            className={cn(
                                "flex items-center w-full px-3 py-2 text-left hover:bg-gray-100",
                                index === activeWorkspace && "bg-blue-50 text-blue-600"
                            )}
                            onClick={() => {
                                onSwitchWorkspace(index);
                                setIsMenuOpen(false);
                            }}
                        >
                            <Monitor size={16} className="mr-2" />
                            Workspace {index + 1}
                        </button>
                    ))}
                    
                    <button 
                        className="flex items-center w-full px-3 py-2 text-left hover:bg-gray-100 border-t border-gray-200"
                        onClick={() => {
                            onCreateWorkspace();
                            setIsMenuOpen(false);
                        }}
                    >
                        <Plus size={16} className="mr-2" />
                        New Workspace
                    </button>
                </div>
            )}
        </div>
    );
}

export default WorkspaceSwitcher;
