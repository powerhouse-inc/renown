interface ButtonProps
    extends React.DetailedHTMLProps<
            React.ButtonHTMLAttributes<HTMLButtonElement>,
            HTMLButtonElement
        >,
        React.AriaAttributes {
    primary?: boolean;
    secondary?: boolean;
}

const Button: React.FC<ButtonProps> = ({
    className,
    primary,
    secondary,
    ...props
}) => {
    return (
        <button
            className={`${
                primary
                    ? "bg-primary text-primary-foreground hover:bg-primary/75"
                    : secondary
                    ? "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
                    : ""
            } 
            font-semibold disabled:opacity-60 disabled:pointer-events-none
            transition-colors rounded-md p-2 ${className}`}
            {...props}
        />
    );
};

export default Button;
