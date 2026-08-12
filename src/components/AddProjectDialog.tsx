import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AddProjectDialog() {
  return (
    <Dialog>
      <form>
        <DialogTrigger
          render={<Button variant='outline'>Open Dialog</Button>}
        />
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor='name-1'>Название Проекта</Label>
              <Input id='name-1' name='name' />
            </Field>
            <Field>
              <Label htmlFor='username-1'>Ответственный</Label>
              <Input id='username-1' name='username' />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant='outline'>Cancel</Button>} />
            <Button type='submit'>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  );
}
