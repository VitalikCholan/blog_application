import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @MinLength(10)
  content: string;
}

export class UpdatePostDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @MinLength(10)
  content: string;
}
