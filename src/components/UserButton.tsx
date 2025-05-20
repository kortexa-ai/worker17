import { Button } from "./ui/button";
import { useAuth } from "@kortexa-ai/auth";
import { LogInIcon, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";

export function UserButton() {
    const { currentUser, login, logout } = useAuth();

    return (
        currentUser ? (
            <div className="flex items-center gap-2 group cursor-pointer">
                <Button onClick={logout}
                    variant='default'
                    size='icon'
                    className={`
                        rounded-full group-hover:shadow-xl group-hover:scale-110
                        ring-2 ring-transparent group-hover:ring-blue-400
                        transition-all duration-300
                        flex items-center
                    `}
                >
                    <Avatar className="ring-2 ring-transparent">
                        <AvatarImage
                            src={currentUser?.photoURL || ''}
                            alt={currentUser?.email || ''}
                            className="group-hover:rotate-6 transition-transform duration-300"
                        />
                        <AvatarFallback className="group-hover:bg-blue-100 transition-colors duration-300">
                            <User className="h-4 w-4" />
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </div>
        ) : (
            <Button onClick={login}
                variant='default'
                size='icon'
                className={`
                        rounded-full hover:shadow-xl hover:scale-105
                        hover:bg-blue-50 hover:text-blue-500
                        transition-all duration-300
                    `}
            >
                <LogInIcon />
            </Button>
        )
    )
}
